"""
Clips Vague C lite :
  source longue → candidates hooks (début + pics énergie) → extrait principal
  + suggestions pour créer d'autres versions.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

from engines.edit import ffprobe_duration, propose_segments
from engines.suggest import propose_suggestions, _loudest_window

log = logging.getLogger("engines.clips")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ProgressCb = Callable[[int, str], None]


def run_clips_stub(
    *,
    source_path: Path,
    hook_duration_s: int = 15,
    on_progress: ProgressCb | None = None,
) -> tuple[Path, list[dict[str, Any]], list[dict[str, Any]]]:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    if not source_path.is_file():
        raise FileNotFoundError(f"Source introuvable: {source_path}")

    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable — installer ffmpeg")

    hook_s = max(3, min(int(hook_duration_s), 90))
    prog(15, f"Analyse source ({hook_s}s hooks)")
    try:
        full_dur = ffprobe_duration(source_path)
    except Exception as exc:  # noqa: BLE001
        log.warning("ffprobe: %s — fallback stub", exc)
        out = _synthetic_clip(ffmpeg, hook_s, OUTPUT_DIR / f"clip_synth_{hook_s}s.mp4")
        return out, _fallback_proposals(hook_s), []

    hooks = _propose_hook_windows(source_path, hook_s, full_dur)
    if not hooks:
        hooks = [{"start": 0.0, "end": min(float(hook_s), full_dur), "label": "ouverture", "score": 0.8}]

    primary = hooks[0]
    out = OUTPUT_DIR / (
        f"clip_hook_{abs(hash(str(source_path))) % 10_000_000}_"
        f"{int(primary['start'])}_{int(primary['end'])}.mp4"
    )
    prog(30, f"Extrait principal {primary['start']:.1f}→{primary['end']:.1f}s")
    _extract_window(ffmpeg, source_path, float(primary["start"]), float(primary["end"]), out)
    if not out.is_file() or out.stat().st_size < 100:
        prog(40, "Fallback stub synthétique")
        out = _synthetic_clip(ffmpeg, hook_s, out)

    # Segments / suggestions sur la SOURCE complète (timeline absolue)
    prog(55, "Segments + suggestions sur timeline complète")
    try:
        proposals = propose_segments(source_path, max_segments=6)
    except Exception as exc:  # noqa: BLE001
        log.warning("Propositions segments échouées: %s", exc)
        proposals = _fallback_proposals(min(full_dur, float(hook_s)))

    suggestions: list[dict[str, Any]] = []
    for i, h in enumerate(hooks):
        suggestions.append(
            {
                "id": f"sug_hook_{i}_{int(h['start'])}",
                "kind": "hook",
                "title": f"Hook {h.get('label', i + 1)}",
                "description": (
                    f"{h.get('label', 'extrait')} · "
                    f"{float(h['start']):.1f}s → {float(h['end']):.1f}s "
                    f"({float(h['end']) - float(h['start']):.0f}s)"
                ),
                "start": round(float(h["start"]), 2),
                "end": round(float(h["end"]), 2),
                "score": float(h.get("score", 0.8)),
            }
        )

    try:
        extra = propose_suggestions(source_path, proposals)
        # Évite doublons trop proches des hooks déjà listés
        for sug in extra:
            if sug.get("kind") == "hook":
                if _overlaps_existing(sug, suggestions, tol=1.0):
                    continue
            suggestions.append(sug)
    except Exception as exc:  # noqa: BLE001
        log.warning("Suggestions Couche 4 échouées: %s", exc)

    suggestions.sort(key=lambda s: float(s.get("score", 0)), reverse=True)
    prog(78, f"{len(proposals)} segments · {len(suggestions)} suggestions · {len(hooks)} hooks")
    return out, proposals, suggestions


def _propose_hook_windows(
    source_path: Path, hook_s: int, full_dur: float
) -> list[dict[str, Any]]:
    """2–3 fenêtres de durée hook_s : ouverture, pic énergie, milieu."""
    win = min(float(hook_s), full_dur)
    if win < 2.0:
        return [{"start": 0.0, "end": full_dur, "label": "entier", "score": 0.7}]

    hooks: list[dict[str, Any]] = [
        {"start": 0.0, "end": win, "label": "ouverture", "score": 0.88}
    ]

    peak = _loudest_window(source_path, window_s=win)
    if peak is not None:
        ps, pe = peak
        # recentrer / clamp fenêtre exacte hook_s
        mid = (ps + pe) / 2
        start = max(0.0, mid - win / 2)
        end = start + win
        if end > full_dur:
            end = full_dur
            start = max(0.0, end - win)
        if start > 1.0 or end < full_dur - 1.0:
            if not _near(start, hooks[0]["start"], tol=win * 0.5):
                hooks.append(
                    {
                        "start": start,
                        "end": end,
                        "label": "énergie",
                        "score": 0.92,
                    }
                )

    if full_dur >= win * 2.5:
        mid_start = max(0.0, full_dur / 2 - win / 2)
        mid_end = mid_start + win
        if mid_end > full_dur:
            mid_end = full_dur
            mid_start = max(0.0, mid_end - win)
        if all(not _near(mid_start, h["start"], tol=win * 0.5) for h in hooks):
            hooks.append(
                {
                    "start": mid_start,
                    "end": mid_end,
                    "label": "milieu",
                    "score": 0.78,
                }
            )

    hooks.sort(key=lambda h: float(h.get("score", 0)), reverse=True)
    return hooks[:3]


def _near(a: float, b: float, *, tol: float) -> bool:
    return abs(float(a) - float(b)) < tol


def _overlaps_existing(
    sug: dict[str, Any], existing: list[dict[str, Any]], *, tol: float
) -> bool:
    try:
        s0, e0 = float(sug["start"]), float(sug["end"])
    except (KeyError, TypeError, ValueError):
        return False
    for h in existing:
        try:
            s1, e1 = float(h["start"]), float(h["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if abs(s0 - s1) < tol and abs(e0 - e1) < tol:
            return True
    return False


def _extract_window(
    ffmpeg: str, source: Path, start: float, end: float, out: Path
) -> None:
    dur = max(0.5, end - start)
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(source),
        "-t",
        f"{dur:.3f}",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(out),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=False)


def _fallback_proposals(duration: float) -> list[dict[str, Any]]:
    return [
        {
            "id": "seg_1",
            "start": 0.0,
            "end": float(duration),
            "label": "Segment 1",
            "keep": True,
            "reason": "fallback-full",
        }
    ]


def _synthetic_clip(ffmpeg: str, duration: int, out: Path) -> Path:
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        f"color=c=0x0d9488:s=720x1280:d={duration}",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=44100:cl=stereo",
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return out

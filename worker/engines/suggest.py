"""
Couche 4 lite — suggestions intelligentes heuristiques (sans GPU).
Kinds: hook (ouverture / pic énergie), cut (segment faible), zoom (punch-in).
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from engines.edit import ffprobe_duration, render_edit

log = logging.getLogger("engines.suggest")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ProgressCb = Callable[[int, str], None]


def propose_suggestions(
    video_path: Path,
    segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    duration = ffprobe_duration(video_path)
    suggestions: list[dict[str, Any]] = []

    hook_len = min(3.0, max(1.5, duration * 0.2))
    suggestions.append(
        {
            "id": "sug_hook_open",
            "kind": "hook",
            "title": "Hook ouverture",
            "description": f"Garder les {hook_len:.1f}s du début (cold open)",
            "start": 0.0,
            "end": round(hook_len, 2),
            "score": 0.85,
        }
    )

    peak = _loudest_window(video_path, window_s=min(3.0, duration))
    if peak is not None:
        ps, pe = peak
        if pe - ps >= 1.0 and (ps > 0.4 or pe < duration - 0.4):
            suggestions.append(
                {
                    "id": "sug_hook_peak",
                    "kind": "hook",
                    "title": "Hook énergie",
                    "description": f"Pic audio {ps:.1f}s → {pe:.1f}s",
                    "start": round(ps, 2),
                    "end": round(pe, 2),
                    "score": 0.9,
                }
            )

    if len(segments) >= 2:
        shortest = min(segments, key=lambda s: float(s["end"]) - float(s["start"]))
        kept = [
            {**s, "keep": s.get("id") != shortest.get("id")}
            for s in segments
        ]
        suggestions.append(
            {
                "id": "sug_cut_weak",
                "kind": "cut",
                "title": "Couper le segment faible",
                "description": f"Jeter {shortest.get('label', shortest.get('id'))} "
                f"({float(shortest['end']) - float(shortest['start']):.1f}s)",
                "segmentId": shortest.get("id"),
                "segments": kept,
                "score": 0.75,
            }
        )

    if segments:
        longest = max(segments, key=lambda s: float(s["end"]) - float(s["start"]))
        ls, le = float(longest["start"]), float(longest["end"])
        mid = (ls + le) / 2
        half = min(1.5, (le - ls) / 2)
        zs, ze = max(ls, mid - half), min(le, mid + half)
        if ze - zs >= 1.0:
            suggestions.append(
                {
                    "id": "sug_zoom_punch",
                    "kind": "zoom",
                    "title": "Zoom punch-in",
                    "description": f"Recadrage ×1.35 sur {zs:.1f}s → {ze:.1f}s",
                    "start": round(zs, 2),
                    "end": round(ze, 2),
                    "zoom": 1.35,
                    "score": 0.7,
                }
            )

    suggestions.sort(key=lambda s: float(s.get("score", 0)), reverse=True)
    log.info("Couche 4: %d suggestions", len(suggestions))
    return suggestions


def apply_suggestion(
    *,
    source_path: Path,
    suggestion: dict[str, Any],
    base_segments: list[dict[str, Any]] | None = None,
    on_progress: ProgressCb | None = None,
) -> Path:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    kind = suggestion.get("kind")
    prog(25, f"Appliquer suggestion {kind}")

    if kind == "cut":
        segs = suggestion.get("segments") or base_segments
        if not segs:
            raise ValueError("Suggestion cut sans segments")
        return render_edit(
            source_path=source_path, segments=segs, on_progress=on_progress
        )

    if kind == "hook":
        start = float(suggestion["start"])
        end = float(suggestion["end"])
        segs = [
            {
                "id": "hook",
                "start": start,
                "end": end,
                "label": "Hook",
                "keep": True,
            }
        ]
        return render_edit(
            source_path=source_path, segments=segs, on_progress=on_progress
        )

    if kind == "zoom":
        start = float(suggestion["start"])
        end = float(suggestion["end"])
        zoom = float(suggestion.get("zoom") or 1.35)
        return _render_zoom(
            source_path=source_path,
            start=start,
            end=end,
            zoom=zoom,
            on_progress=on_progress,
        )

    raise ValueError(f"Kind inconnu: {kind}")


def _render_zoom(
    *,
    source_path: Path,
    start: float,
    end: float,
    zoom: float,
    on_progress: ProgressCb | None = None,
) -> Path:
    def prog(p: int, msg: str) -> None:
        if on_progress:
            on_progress(p, msg)

    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    zoom = max(1.1, min(zoom, 2.0))
    # scale up then center-crop back to original size
    vf = (
        f"scale=iw*{zoom}:ih*{zoom},"
        f"crop=iw/{zoom}:ih/{zoom}"
    )
    out = (
        OUTPUT_DIR
        / f"clip_zoom_{abs(hash(f'{source_path}:{start}:{end}:{zoom}')) % 10_000_000}.mp4"
    )
    prog(40, f"Zoom ×{zoom:.2f}")
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-to",
        f"{end:.3f}",
        "-i",
        str(source_path),
        "-vf",
        vf,
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
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not out.is_file():
        raise RuntimeError(f"Zoom échoué: {(proc.stderr or '')[-400:]}")
    prog(75, f"Zoom prêt: {out.name}")
    return out


def _loudest_window(path: Path, window_s: float = 3.0) -> tuple[float, float] | None:
    """Approx: parse astats / volumedetect over the file via ffmpeg lavfi."""
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    duration = ffprobe_duration(path)
    if duration < window_s:
        return (0.0, duration)

    # Sample mean_volume every ~0.5s with silencedetect inverted approach:
    # export wav and scan RMS in python if possible; else use ffmpeg astats chunks.
    try:
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "a.wav"
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(path),
                    "-ac",
                    "1",
                    "-ar",
                    "8000",
                    str(wav),
                ],
                check=True,
                capture_output=True,
            )
            raw = wav.read_bytes()
            # skip WAV header ~44 bytes; 16-bit mono
            pcm = raw[44:]
            if len(pcm) < 100:
                return None
            import array
            import math

            samples = array.array("h")
            samples.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
            rate = 8000
            win = int(window_s * rate)
            step = max(1, int(0.25 * rate))
            best_i, best_e = 0, -1.0
            for i in range(0, max(1, len(samples) - win), step):
                chunk = samples[i : i + win]
                if not chunk:
                    continue
                energy = math.sqrt(sum(x * x for x in chunk) / len(chunk))
                if energy > best_e:
                    best_e = energy
                    best_i = i
            start = best_i / rate
            end = min(duration, start + window_s)
            return (start, end)
    except Exception as exc:  # noqa: BLE001
        log.warning("loudest_window: %s", exc)
        # fallback mid window
        mid = max(0.0, duration / 2 - window_s / 2)
        return (mid, min(duration, mid + window_s))

"""
Couche 3 — édition hybride légère.
L'IA (heuristique ffmpeg) propose des segments ; l'utilisateur garde/jette.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("engines.edit")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ProgressCb = Callable[[int, str], None]


def ffprobe_duration(path: Path) -> float:
    ffprobe = os.environ.get("FFPROBE_BIN") or shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe introuvable")
    out = subprocess.check_output(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return max(0.1, float(out))


def propose_segments(video_path: Path, max_segments: int = 5) -> list[dict[str, Any]]:
    """Propose des segments via silencedetect, sinon découpe égale."""
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    duration = ffprobe_duration(video_path)
    silences = _detect_silences(ffmpeg, video_path)
    speech = _invert_silences(silences, duration)

    # Filtrer segments trop courts
    speech = [(s, e) for s, e in speech if e - s >= 0.8]
    if len(speech) < 2:
        # Fallback : 3 tranches égales
        n = min(3, max(2, int(duration // 3) and 3))
        step = duration / n
        speech = [(i * step, min(duration, (i + 1) * step)) for i in range(n)]

    # Fusionner / limiter
    if len(speech) > max_segments:
        # garder les plus longs
        speech = sorted(speech, key=lambda se: se[1] - se[0], reverse=True)[
            :max_segments
        ]
        speech = sorted(speech, key=lambda se: se[0])

    segments: list[dict[str, Any]] = []
    for i, (start, end) in enumerate(speech):
        segments.append(
            {
                "id": f"seg_{i + 1}",
                "start": round(start, 2),
                "end": round(end, 2),
                "label": f"Segment {i + 1}",
                "keep": True,
                "reason": "silence-cut" if silences else "equal-split",
            }
        )
    log.info("Propositions: %d segments (durée=%.1fs)", len(segments), duration)
    return segments


def render_edit(
    *,
    source_path: Path,
    segments: list[dict[str, Any]],
    on_progress: ProgressCb | None = None,
) -> Path:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    kept = [
        s
        for s in segments
        if s.get("keep", True)
        and float(s.get("end", 0)) > float(s.get("start", 0)) + 0.05
    ]
    if not kept:
        raise ValueError("Aucun segment conservé")

    prog(30, f"Rendu {len(kept)} segment(s)")
    out = (
        OUTPUT_DIR
        / f"clip_edit_{abs(hash(str(source_path) + str(kept))) % 10_000_000}.mp4"
    )

    with tempfile.TemporaryDirectory(prefix="reho_edit_") as tmp:
        tmp_path = Path(tmp)
        parts: list[Path] = []
        for i, seg in enumerate(kept):
            start = float(seg["start"])
            end = float(seg["end"])
            part = tmp_path / f"part_{i:02d}.mp4"
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
                str(part),
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if proc.returncode != 0 or not part.is_file():
                raise RuntimeError(
                    f"Découpe segment {seg.get('id')} échouée: {(proc.stderr or '')[-400:]}"
                )
            parts.append(part)
            prog(30 + int(40 * (i + 1) / len(kept)), f"Segment {i + 1}/{len(kept)}")

        if len(parts) == 1:
            shutil.copy2(parts[0], out)
        else:
            lst = tmp_path / "list.txt"
            lst.write_text(
                "\n".join(f"file '{p.resolve()}'" for p in parts) + "\n",
                encoding="utf-8",
            )
            cmd = [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(lst),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(out),
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if proc.returncode != 0 or not out.is_file():
                cmd_re = [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(lst),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "23",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(out),
                ]
                proc = subprocess.run(
                    cmd_re, capture_output=True, text=True, check=False
                )
                if proc.returncode != 0 or not out.is_file():
                    raise RuntimeError(
                        f"Concat échouée: {(proc.stderr or '')[-400:]}"
                    )

    prog(75, f"Edit prêt: {out.name}")
    return out


def _detect_silences(ffmpeg: str, path: Path) -> list[tuple[float, float]]:
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-i",
        str(path),
        "-af",
        "silencedetect=noise=-30dB:d=0.4",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    text = (proc.stderr or "") + (proc.stdout or "")
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", text)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", text)]
    pairs: list[tuple[float, float]] = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else None
        if e is not None and e > s:
            pairs.append((s, e))
    return pairs


def _invert_silences(
    silences: list[tuple[float, float]], duration: float
) -> list[tuple[float, float]]:
    if not silences:
        return []
    regions: list[tuple[float, float]] = []
    cursor = 0.0
    for s, e in sorted(silences):
        if s > cursor + 0.05:
            regions.append((cursor, s))
        cursor = max(cursor, e)
    if duration > cursor + 0.05:
        regions.append((cursor, duration))
    return regions

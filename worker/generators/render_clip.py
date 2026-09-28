"""
Découpe un clip (ffmpeg) + reframe 9:16 intelligent + captions virales (ASS).
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

from generators.captions import (
    ass_filter_arg,
    build_cues_for_clip,
    cues_from_caption_text,
    write_viral_ass,
)
from generators.reframe import build_reframe_vf

log = logging.getLogger("rehovision-worker.render_clip")


def render_clip(
    source_path: Path,
    output_path: Path,
    *,
    start_sec: float,
    end_sec: float,
    caption_text: str | None = None,
    caption_segments: list[dict[str, Any]] | None = None,
) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg introuvable dans le PATH")

    duration = max(0.5, float(end_sec) - float(start_sec))
    work = output_path.parent
    work.mkdir(parents=True, exist_ok=True)

    cues: list[tuple[float, float, str]] = []
    if caption_segments:
        cues = build_cues_for_clip(
            caption_segments,
            float(start_sec),
            float(end_sec),
        )
    if not cues and caption_text:
        cues = cues_from_caption_text(caption_text, duration)

    ass_path: Path | None = None
    if cues:
        ass_path = work / "captions.ass"
        write_viral_ass(ass_path, cues)

    reframe_vf = build_reframe_vf(
        source_path,
        float(start_sec),
        float(end_sec),
        work,
    )
    vf_parts = [reframe_vf]
    if ass_path is not None:
        vf_parts.append(ass_filter_arg(ass_path))

    vf = ",".join(vf_parts)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration:.3f}",
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
        str(output_path),
    ]

    log.info(
        "ffmpeg cut %.1f–%.1f captions=%s reframe → %s",
        start_sec,
        end_sec,
        len(cues),
        output_path.name,
    )
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        if ass_path is not None:
            log.warning("render avec captions échoué — retry sans captions")
            return render_clip(
                source_path,
                output_path,
                start_sec=start_sec,
                end_sec=end_sec,
                caption_text=None,
                caption_segments=None,
            )
        # Dernier recours letterbox
        log.warning("reframe échoué — retry letterbox: %s", proc.stderr[-400:])
        vf_lb = (
            "scale=1080:1920:force_original_aspect_ratio=decrease,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
        )
        cmd_lb = cmd.copy()
        # Remplacer -vf value
        vf_idx = cmd_lb.index("-vf") + 1
        cmd_lb[vf_idx] = vf_lb
        proc2 = subprocess.run(cmd_lb, capture_output=True, text=True)
        if proc2.returncode != 0:
            raise RuntimeError(
                f"ffmpeg failed ({proc2.returncode}): {proc2.stderr[-800:]}"
            )
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("Clip rendu vide")
        return output_path

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("Clip rendu vide")
    return output_path

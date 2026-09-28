"""
Découpe un clip (ffmpeg) + burn-in captions simples.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import textwrap
from pathlib import Path

log = logging.getLogger("rehovision-worker.render_clip")


def _escape_drawtext(s: str) -> str:
    # Caractères spéciaux pour le filtre drawtext ffmpeg
    return (
        s.replace("\\", "\\\\")
        .replace("'", r"\'")
        .replace(":", r"\:")
        .replace("%", r"\%")
    )


def _find_font() -> str | None:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for path in candidates:
        if Path(path).is_file():
            return path
    return None


def render_clip(
    source_path: Path,
    output_path: Path,
    *,
    start_sec: float,
    end_sec: float,
    caption_text: str | None = None,
) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg introuvable dans le PATH")

    duration = max(0.5, float(end_sec) - float(start_sec))
    caption = (caption_text or "").strip()
    # Une ligne courte pour le bas d'écran
    if caption:
        wrapped = "\\n".join(textwrap.wrap(caption, width=36)[:3])
        wrapped = _escape_drawtext(wrapped)
    else:
        wrapped = ""

    font = _find_font()
    vf_parts = [
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    ]
    if wrapped and font:
        vf_parts.append(
            f"drawtext=fontfile={font}:text='{wrapped}':fontsize=42:"
            f"fontcolor=white:borderw=3:bordercolor=black:"
            f"x=(w-text_w)/2:y=h*0.78"
        )

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

    log.info("ffmpeg cut %.1f–%.1f → %s", start_sec, end_sec, output_path.name)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        # Retry sans burn-in si drawtext casse
        if wrapped:
            log.warning("drawtext échoué — retry sans captions")
            return render_clip(
                source_path,
                output_path,
                start_sec=start_sec,
                end_sec=end_sec,
                caption_text=None,
            )
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode}): {proc.stderr[-800:]}"
        )

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("Clip rendu vide")
    return output_path

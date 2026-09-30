"""
Étape 7 — concat hard-cut de 2–3 clips 9:16 déjà rendus.
Préfère stream-copy ; fallback re-encode si codecs incompatibles.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.request import urlretrieve

log = logging.getLogger("rehovision-worker.stitch_clips")


def _run(cmd: list[str], label: str) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"{label} échoué: {(proc.stderr or proc.stdout or '')[-900:]}"
        )


def _probe_duration(path: Path) -> float | None:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    try:
        return float((proc.stdout or "").strip())
    except ValueError:
        return None


def _resolve_clip(
    url: str,
    dest: Path,
    *,
    resolve_local_file: Any,
) -> Path:
    """URL /media/{id} locale ou download HTTP."""
    if "/media/" in url:
        file_id = url.rstrip("/").rsplit("/media/", 1)[-1].split("?")[0]
        local = resolve_local_file(file_id) if resolve_local_file else None
        if local and Path(local).is_file():
            shutil.copy2(local, dest)
            return dest
    urlretrieve(url, dest)
    if not dest.is_file() or dest.stat().st_size == 0:
        raise RuntimeError(f"Téléchargement vide: {url}")
    return dest


def _concat_copy(list_path: Path, out: Path) -> bool:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode == 0 and out.is_file() and out.stat().st_size > 0


def _concat_reencode(paths: list[Path], out: Path) -> None:
    """Fallback : scale/pad 1080x1920 + aac + concat filter."""
    n = len(paths)
    inputs: list[str] = []
    for p in paths:
        inputs.extend(["-i", str(p)])

    # [0:v][0:a][1:v][1:a]... concat
    parts: list[str] = []
    for i in range(n):
        parts.append(
            f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
            f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,"
            f"format=yuv420p[v{i}];"
            f"[{i}:a]aformat=sample_fmts=fltp:sample_rates=44100:"
            f"channel_layouts=stereo[a{i}];"
        )
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(n))
    filter_complex = (
        "".join(parts)
        + f"{concat_in}concat=n={n}:v=1:a=1[vout][aout]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex",
        filter_complex,
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(out),
    ]
    _run(cmd, "ffmpeg stitch re-encode")


def stitch_clips(
    clip_urls: list[str],
    output_path: Path,
    *,
    work_dir: Path,
    resolve_local_file: Any = None,
) -> tuple[Path, float]:
    if len(clip_urls) < 2 or len(clip_urls) > 3:
        raise ValueError("stitch_clips attend 2 ou 3 URLs")

    paths: list[Path] = []
    for i, url in enumerate(clip_urls):
        dest = work_dir / f"part_{i}.mp4"
        paths.append(
            _resolve_clip(url, dest, resolve_local_file=resolve_local_file)
        )

    list_path = work_dir / "concat.txt"
    # Chemins absolus, escape single quotes for concat demuxer
    lines: list[str] = []
    for p in paths:
        escaped = str(p.resolve()).replace("'", "'\\''")
        lines.append(f"file '{escaped}'\n")
    list_path.write_text("".join(lines), encoding="utf-8")

    out = output_path
    if _concat_copy(list_path, out):
        log.info("Stitch copy OK → %s", out)
    else:
        log.warning("Stitch copy échoué — fallback re-encode")
        if out.exists():
            out.unlink()
        _concat_reencode(paths, out)
        log.info("Stitch re-encode OK → %s", out)

    duration = _probe_duration(out) or 0.0
    if duration <= 0:
        # Somme approx via probes des parts
        duration = sum(_probe_duration(p) or 0.0 for p in paths)
    return out, duration

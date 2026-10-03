"""
Couche 2 stub — pas d'IA hooks encore.
Télécharge la source → ffmpeg coupe les N premières secondes → MP4 H.264.
Propose aussi des segments Couche 3 (heuristique silence).
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable

from engines.edit import propose_segments
from engines.suggest import propose_suggestions

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

    duration = max(3, min(int(hook_duration_s), 60))
    out = OUTPUT_DIR / f"clip_stub_{abs(hash(str(source_path))) % 10_000_000}_{duration}s.mp4"

    prog(25, f"ffmpeg coupe {duration}s depuis {source_path.name}")
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-t",
        str(duration),
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
    if proc.returncode != 0 or not out.is_file() or out.stat().st_size < 100:
        err = (proc.stderr or proc.stdout or "ffmpeg failed")[-800:]
        # Fallback : vidéo colorée + silence si la source est invalide
        prog(40, "Fallback stub synthétique (source illisible)")
        out = _synthetic_clip(ffmpeg, duration, out)
        if not out.is_file():
            raise RuntimeError(f"ffmpeg échec: {err}")
    prog(70, f"Clip stub prêt: {out.name} ({out.stat().st_size} o)")
    try:
        proposals = propose_segments(out)
    except Exception as exc:  # noqa: BLE001
        log.warning("Propositions segments échouées: %s", exc)
        proposals = [
            {
                "id": "seg_1",
                "start": 0.0,
                "end": float(duration),
                "label": "Segment 1",
                "keep": True,
                "reason": "fallback-full",
            }
        ]
    try:
        suggestions = propose_suggestions(out, proposals)
    except Exception as exc:  # noqa: BLE001
        log.warning("Suggestions Couche 4 échouées: %s", exc)
        suggestions = []
    prog(78, f"{len(proposals)} segments · {len(suggestions)} suggestions")
    return out, proposals, suggestions


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
        f"anullsrc=r=44100:cl=stereo",
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

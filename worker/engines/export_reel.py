"""
Export Reel — crop/scale 9:16 + captions brûlées (Whisper → SRT → ffmpeg).
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from engines.stt import transcribe_cues

log = logging.getLogger("engines.export_reel")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ProgressCb = Callable[[int, str], None]

# TikTok / Reels / Shorts
TARGET_W = 1080
TARGET_H = 1920


def render_reel_916(
    *,
    source_path: Path,
    captions: bool = True,
    language: str | None = None,
    on_progress: ProgressCb | None = None,
) -> tuple[Path, dict[str, Any]]:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    prog(10, "Préparation export 9:16")
    out = (
        OUTPUT_DIR
        / f"clip_export_{abs(hash(str(source_path) + str(captions))) % 10_000_000}.mp4"
    )

    cues: list[dict[str, Any]] = []
    srt_path: Path | None = None
    tmp_dir: tempfile.TemporaryDirectory[str] | None = None

    try:
        if captions:
            prog(25, "Transcription Whisper…")
            try:
                cues = transcribe_cues(source_path, language=language)
            except Exception as exc:  # noqa: BLE001
                log.warning("Captions ignorées (Whisper): %s", exc)
                cues = []

        vf = (
            f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=increase,"
            f"crop={TARGET_W}:{TARGET_H},setsar=1"
        )

        if cues:
            tmp_dir = tempfile.TemporaryDirectory(prefix="rehovision_srt_")
            srt_path = Path(tmp_dir.name) / "captions.srt"
            _write_srt(cues, srt_path)
            # Escape for ffmpeg filter: \ : '
            escaped = (
                str(srt_path.resolve())
                .replace("\\", "\\\\")
                .replace(":", "\\:")
                .replace("'", "\\'")
            )
            style = (
                "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,"
                "OutlineColour=&H00000000,BorderStyle=3,Outline=2,"
                "Alignment=2,MarginV=120"
            )
            vf = f"{vf},subtitles={escaped}:force_style='{style}'"
            prog(45, f"Burn-in {len(cues)} captions")
        else:
            prog(45, "Export 9:16 sans captions")

        prog(55, "Encodage ffmpeg…")
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(source_path),
            "-vf",
            vf,
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
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        prog(95, "Export prêt")
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or exc.stdout or str(exc))[-800:]
        raise RuntimeError(f"ffmpeg export 9:16 échoué: {err}") from exc
    finally:
        if tmp_dir is not None:
            tmp_dir.cleanup()

    if not out.is_file() or out.stat().st_size < 1000:
        raise RuntimeError("Export 9:16 vide ou manquant")

    meta = {
        "aspect": "9:16",
        "width": TARGET_W,
        "height": TARGET_H,
        "captions": bool(cues),
        "cueCount": len(cues),
    }
    return out, meta


def _write_srt(cues: list[dict[str, Any]], path: Path) -> None:
    lines: list[str] = []
    for i, cue in enumerate(cues, start=1):
        start = float(cue["start"])
        end = float(cue["end"])
        text = str(cue["text"]).replace("\n", " ").strip()
        if not text:
            continue
        lines.append(str(i))
        lines.append(f"{_srt_ts(start)} --> {_srt_ts(end)}")
        lines.append(text)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def _srt_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        ms = 999
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

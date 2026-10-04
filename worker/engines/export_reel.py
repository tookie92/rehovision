"""
Export Reel — crop/scale 9:16 + captions brûlées (Whisper → SRT → ffmpeg).

Style v2 : phrases courtes (≤5 mots), police compacte, outline sans pavé opaque,
safe-zone bas (Reels / Shorts).
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

from engines.stt import transcribe_cues

log = logging.getLogger("engines.export_reel")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ProgressCb = Callable[[int, str], None]

# TikTok / Reels / Shorts
TARGET_W = 1080
TARGET_H = 1920

# Captions lite (lisibles sans manger l'image)
MAX_WORDS_PER_CUE = 5
MAX_CHARS_PER_CUE = 28
MIN_CUE_S = 0.55
MAX_CUE_S = 2.4


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
    tmp_dir: tempfile.TemporaryDirectory[str] | None = None

    try:
        if captions:
            prog(25, "Transcription Whisper…")
            try:
                raw = transcribe_cues(source_path, language=language)
                cues = _compact_cues(raw)
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
            escaped = _ffmpeg_path(srt_path)
            # BorderStyle=1 = outline only (pas de boîte opaque)
            # FontSize ~42 playres 1080 → lisible sans envahir
            # MarginV élevé = plus haut depuis le bas… non: MarginV = distance du bord
            # Alignment=2 bottom-center ; MarginV=160 ≈ safe zone UI Reels
            style = (
                "FontName=Arial,FontSize=18,Bold=1,"
                "PrimaryColour=&H00FFFFFF,OutlineColour=&H00101010,"
                "BackColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,"
                "Alignment=2,MarginL=80,MarginR=80,MarginV=220"
            )
            vf = f"{vf},subtitles={escaped}:force_style='{style}'"
            prog(45, f"Burn-in {len(cues)} captions compactes")
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
        "captionStyle": "compact-v2",
    }
    return out, meta


def _compact_cues(cues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Découpe les segments Whisper en courtes bulles type Shorts."""
    out: list[dict[str, Any]] = []
    for cue in cues:
        text = re.sub(r"\s+", " ", str(cue.get("text") or "")).strip()
        if not text:
            continue
        start = float(cue["start"])
        end = float(cue["end"])
        if end <= start:
            end = start + MIN_CUE_S
        words = text.split(" ")
        chunks = _chunk_words(words)
        if not chunks:
            continue
        total_w = sum(len(c) for c in chunks)
        span = max(end - start, MIN_CUE_S * len(chunks))
        t = start
        for i, chunk in enumerate(chunks):
            weight = len(chunk) / total_w
            dur = min(MAX_CUE_S, max(MIN_CUE_S, span * weight))
            # dernier chunk colle à end
            if i == len(chunks) - 1:
                chunk_end = max(t + MIN_CUE_S, end)
            else:
                chunk_end = t + dur
            out.append(
                {
                    "start": round(t, 3),
                    "end": round(chunk_end, 3),
                    "text": " ".join(chunk),
                }
            )
            t = chunk_end
    return out


def _chunk_words(words: list[str]) -> list[list[str]]:
    chunks: list[list[str]] = []
    cur: list[str] = []
    for w in words:
        tentative = (" ".join(cur + [w])).strip()
        if cur and (
            len(cur) >= MAX_WORDS_PER_CUE or len(tentative) > MAX_CHARS_PER_CUE
        ):
            chunks.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        chunks.append(cur)
    return chunks


def _ffmpeg_path(path: Path) -> str:
    return (
        str(path.resolve())
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
    )


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

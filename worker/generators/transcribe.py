"""
Transcription audio/vidéo via faster-whisper (local).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger("rehovision-worker.transcribe")

_model = None


def _get_model():
    global _model
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel

    model_size = os.getenv("WHISPER_MODEL", "base")
    device = os.getenv("WHISPER_DEVICE", "cuda")
    compute = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
    # CPU fallback if CUDA unavailable
    try:
        _model = WhisperModel(model_size, device=device, compute_type=compute)
    except Exception as e:
        log.warning("Whisper CUDA indisponible (%s) — fallback CPU int8", e)
        _model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _model


def download_source(url: str, dest: Path) -> Path:
    res = requests.get(url, timeout=600, stream=True)
    res.raise_for_status()
    with dest.open("wb") as f:
        for chunk in res.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
    if dest.stat().st_size == 0:
        raise RuntimeError("Vidéo source vide")
    return dest


def transcribe_video(source_path: Path, language: str | None = None) -> dict[str, Any]:
    """
    Retourne { language, duration, segments: [{start, end, text}] }.
    """
    model = _get_model()
    lang = None if not language or language == "auto" else language

    segments_iter, info = model.transcribe(
        str(source_path),
        language=lang,
        vad_filter=True,
        word_timestamps=False,
    )

    segments: list[dict[str, Any]] = []
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        segments.append(
            {
                "start": round(float(seg.start), 3),
                "end": round(float(seg.end), 3),
                "text": text,
            }
        )

    return {
        "language": info.language,
        "duration": round(float(info.duration or 0), 3),
        "segments": segments,
    }

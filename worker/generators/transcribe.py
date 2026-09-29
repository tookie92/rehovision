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
    expected = res.headers.get("Content-Length")
    expected_n = int(expected) if expected and expected.isdigit() else None
    written = 0
    with dest.open("wb") as f:
        for chunk in res.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
                written += len(chunk)
    if written == 0:
        raise RuntimeError("Vidéo source vide")
    if expected_n is not None and written < expected_n:
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            f"Téléchargement tronqué ({written}/{expected_n} o) — "
            "réessaie ; sinon file MP4 sans moov"
        )
    from generators.media_validate import assert_readable_media

    assert_readable_media(dest, label="source téléchargée")
    return dest


def transcribe_video(source_path: Path, language: str | None = None) -> dict[str, Any]:
    """
    Retourne { language, duration, segments: [{start, end, text}] }.
    """
    from generators.media_validate import assert_readable_media

    assert_readable_media(source_path, label="source")
    model = _get_model()
    lang = None if not language or language == "auto" else language

    segments_iter, info = model.transcribe(
        str(source_path),
        language=lang,
        vad_filter=True,
        word_timestamps=True,
    )

    segments: list[dict[str, Any]] = []
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        words: list[dict[str, Any]] = []
        for w in seg.words or []:
            word = (w.word or "").strip()
            if not word:
                continue
            words.append(
                {
                    "word": word,
                    "start": round(float(w.start), 3),
                    "end": round(float(w.end), 3),
                }
            )
        entry: dict[str, Any] = {
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": text,
        }
        if words:
            entry["words"] = words
        segments.append(entry)

    return {
        "language": info.language,
        "duration": round(float(info.duration or 0), 3),
        "segments": segments,
    }

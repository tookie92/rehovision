"""Speech-to-text via faster-whisper (modèle HF déjà en cache si possible)."""
from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger("engines.stt")

_model = None


def transcribe(
    audio_path: Path,
    language: str | None = None,
) -> str:
    """Retourne le texte brut. language=None → détection auto."""
    model = _ensure_model()
    lang = language.strip() if language else None
    if lang in ("", "auto"):
        lang = None

    log.info("Whisper %s — lang=%s", audio_path.name, lang or "auto")
    segments, info = model.transcribe(
        str(audio_path),
        language=lang,
        beam_size=3,
        vad_filter=True,
    )
    parts: list[str] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if t:
            parts.append(t)
    text = " ".join(parts).strip()
    if not text:
        raise RuntimeError("Whisper: aucune parole détectée")
    detected = getattr(info, "language", None)
    log.info("Whisper OK — %d chars (detected=%s)", len(text), detected)
    return text


def _ensure_model():
    global _model
    if _model is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper absent — pip install faster-whisper dans worker/.venv"
        ) from exc

    name = os.environ.get("WHISPER_MODEL", "Systran/faster-whisper-base")
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get(
        "WHISPER_COMPUTE_TYPE",
        "int8" if device == "cpu" else "float16",
    )
    log.info("Chargement Whisper %s device=%s compute=%s", name, device, compute)
    _model = WhisperModel(name, device=device, compute_type=compute)
    return _model

"""Speech-to-text via faster-whisper (modèle HF déjà en cache si possible)."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger("engines.stt")

_model = None


def transcribe(
    audio_path: Path,
    language: str | None = None,
) -> str:
    """Retourne le texte brut. language=None → détection auto."""
    cues = transcribe_cues(audio_path, language=language)
    text = " ".join(c["text"] for c in cues).strip()
    if not text:
        raise RuntimeError("Whisper: aucune parole détectée")
    return text


def transcribe_cues(
    audio_path: Path,
    language: str | None = None,
) -> list[dict[str, Any]]:
    """Segments horodatés {start, end, text}. Liste vide si silence."""
    model = _ensure_model()
    lang = _normalize_lang(language)

    log.info("Whisper cues %s — lang=%s", audio_path.name, lang or "auto")
    segments, info = model.transcribe(
        str(audio_path),
        language=lang,
        beam_size=3,
        vad_filter=True,
    )
    cues: list[dict[str, Any]] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if not t:
            continue
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", start) or start)
        if end <= start:
            end = start + 0.4
        cues.append(
            {
                "start": round(start, 3),
                "end": round(end, 3),
                "text": t,
            }
        )
    detected = getattr(info, "language", None)
    log.info(
        "Whisper cues OK — %d segments (detected=%s)",
        len(cues),
        detected,
    )
    return cues


def transcribe_words(
    audio_path: Path,
    language: str | None = None,
) -> list[dict[str, Any]]:
    """Mots horodatés {start, end, text} pour karaoke / kinetic."""
    model = _ensure_model()
    lang = _normalize_lang(language)

    log.info("Whisper words %s — lang=%s", audio_path.name, lang or "auto")
    segments, info = model.transcribe(
        str(audio_path),
        language=lang,
        beam_size=3,
        vad_filter=True,
        word_timestamps=True,
    )
    words: list[dict[str, Any]] = []
    for seg in segments:
        seg_words = getattr(seg, "words", None) or []
        if seg_words:
            for w in seg_words:
                t = (getattr(w, "word", None) or getattr(w, "text", None) or "").strip()
                if not t:
                    continue
                start = float(getattr(w, "start", 0.0) or 0.0)
                end = float(getattr(w, "end", start) or start)
                if end <= start:
                    end = start + 0.12
                words.append(
                    {
                        "start": round(start, 3),
                        "end": round(end, 3),
                        "text": t,
                    }
                )
            continue
        # Fallback: découpe naïve du segment
        t = (seg.text or "").strip()
        if not t:
            continue
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", start) or start)
        parts = t.split()
        if not parts:
            continue
        span = max(end - start, 0.12 * len(parts))
        step = span / len(parts)
        for i, part in enumerate(parts):
            ws = start + i * step
            words.append(
                {
                    "start": round(ws, 3),
                    "end": round(ws + step, 3),
                    "text": part,
                }
            )
    detected = getattr(info, "language", None)
    log.info(
        "Whisper words OK — %d mots (detected=%s)",
        len(words),
        detected,
    )
    return words


def _normalize_lang(language: str | None) -> str | None:
    lang = language.strip() if language else None
    if lang in ("", "auto"):
        return None
    return lang


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

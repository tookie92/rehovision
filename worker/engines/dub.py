"""
Pipeline Couche 1 lite :
  audio (optionnel) → Whisper → (traduction Ollama) → TTS (Piper / OmniVoice / stub)
  ou texte direct → (traduction) → TTS
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from engines.stt import transcribe
from engines.translate import translate
from engines.voice import generate_voice

log = logging.getLogger("engines.dub")

ProgressCb = Callable[[int, str], None]


def run_dub(
    *,
    text: str | None,
    audio_path: Path | None,
    source_lang: str,
    target_lang: str,
    instruct: str | None = None,
    on_progress: ProgressCb | None = None,
) -> Path:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    source_lang = (source_lang or "fr").split("-")[0].lower()
    target_lang = (target_lang or "fr").split("-")[0].lower()

    raw = (text or "").strip()
    if raw:
        prog(20, "Texte fourni — Whisper ignoré")
    elif audio_path is not None:
        prog(20, f"Whisper sur {audio_path.name}")
        raw = transcribe(
            audio_path,
            language=source_lang if source_lang != "auto" else None,
        )
    else:
        raise ValueError("Fournir un texte ou un fichier audio")

    prog(40, f"Texte source ({len(raw)} chars)")

    spoken = raw
    if source_lang != target_lang:
        prog(55, f"Traduction {source_lang}→{target_lang}")
        spoken = translate(raw, source_lang, target_lang)
    else:
        prog(55, "Pas de traduction (même langue)")

    prog(70, f"TTS → {target_lang}")
    out = generate_voice(
        text=spoken,
        source_lang=source_lang,
        target_lang=target_lang,
        instruct=instruct,
    )
    prog(78, f"Audio prêt: {out.name}")
    return out

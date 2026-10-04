"""
Pipeline Couche 1 :
  source (texte et/ou audio) → (trad optionnelle) → TTS OmniVoice
  Clone : ref_audio coupé + ref_text = Whisper(ref) aligné — jamais le script long.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from engines.stt import transcribe
from engines.translate import can_auto_translate, translate
from engines.voice import generate_voice, prepare_clone_ref

log = logging.getLogger("engines.dub")

ProgressCb = Callable[[int, str], None]


@dataclass
class DubResult:
    path: Path
    source_text: str
    spoken_text: str
    translated: bool
    clone: bool
    target_lang: str
    source_lang: str


def run_dub(
    *,
    text: str | None,
    audio_path: Path | None,
    source_lang: str,
    target_lang: str,
    target_text: str | None = None,
    auto_translate: bool | None = None,
    instruct: str | None = None,
    clone_voice: bool = True,
    ref_audio_path: Path | None = None,
    speed: float | None = None,
    on_progress: ProgressCb | None = None,
) -> DubResult:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    source_lang = (source_lang or "fr").split("-")[0].lower()
    target_lang = (target_lang or "fr").split("-")[0].lower()
    target_override = (target_text or "").strip() or None

    # --- Texte source ---
    raw = (text or "").strip()
    if raw:
        prog(20, "Texte source fourni")
    elif audio_path is not None:
        prog(20, f"Whisper source sur {audio_path.name}")
        raw = transcribe(
            audio_path,
            language=source_lang if source_lang != "auto" else None,
        )
    else:
        raise ValueError("Fournir un texte ou un fichier audio")

    prog(40, f"Texte source ({len(raw)} chars)")

    # --- Texte cible (lu par TTS) ---
    if target_override:
        spoken = target_override
        translated = spoken.strip() != raw.strip()
        prog(55, f"Texte cible fourni ({len(spoken)} chars) — pas de trad auto")
    elif source_lang == target_lang:
        spoken = raw
        translated = False
        prog(55, "Même langue — pas de traduction")
    else:
        allow = (
            can_auto_translate(source_lang, target_lang)
            if auto_translate is None
            else bool(auto_translate)
        )
        if not allow:
            raise RuntimeError(
                "Traduction auto désactivée pour ce job — fournis un texte "
                "d’aperçu (targetText) déjà validé."
            )
        prog(55, f"Traduction auto {source_lang}→{target_lang}")
        spoken = translate(raw, source_lang, target_lang)
        translated = True

    spoken = spoken.strip()
    if not spoken:
        raise RuntimeError("Texte à lire vide")

    # --- VRAM avant TTS ---
    try:
        from engines.gpu_util import free_vram

        prog(60, "Libération VRAM (Ollama → OmniVoice)")
        free_vram("avant TTS", unload_llm=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("free_vram avant TTS: %s", exc)

    # --- Clone : ref alignée Whisper(extrait) ---
    ref_path = None
    ref_text = None
    if clone_voice:
        ref_src = ref_audio_path or audio_path
        if ref_src is not None and ref_src.is_file():
            prog(65, f"Préparation clone + Whisper ref ({ref_src.name})")
            ref_path, ref_text = prepare_clone_ref(
                ref_src,
                source_lang=source_lang if source_lang != "auto" else None,
            )
        else:
            raise RuntimeError(
                "Mode « Garder ma voix » : audio de référence requis "
                "(échantillon ou audio source)."
            )

    voice_label = "clone" if ref_path else ("design" if instruct else "modèle")
    prog(70, f"TTS → {target_lang} ({voice_label})")
    log.info("TTS lit: %s", spoken[:200].replace("\n", " "))
    out = generate_voice(
        text=spoken,
        source_lang=source_lang,
        target_lang=target_lang,
        instruct=instruct if not ref_path else None,
        ref_audio=ref_path,
        ref_text=ref_text,
        speed=speed,
    )
    prog(78, f"Audio prêt: {out.name}")
    return DubResult(
        path=out,
        source_text=raw,
        spoken_text=spoken,
        translated=translated,
        clone=bool(ref_path),
        target_lang=target_lang,
        source_lang=source_lang,
    )

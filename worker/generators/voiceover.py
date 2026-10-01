"""
TTS local via OmniVoice (clone / voice design / tags [laughter]).
Fallback optionnel : Piper (TTS_ENGINE=piper).
"""

from __future__ import annotations

import logging
import os
import subprocess
import wave
from pathlib import Path
from typing import Any

log = logging.getLogger("rehovision-worker.voiceover")

_omni_model: Any = None

# Mappe le ton Studio → attributs voice-design OmniVoice
_TONE_INSTRUCT: dict[str, str] = {
    "grave": "male, low pitch",
    "mystérieux": "male, low pitch",
    "mysterious": "male, low pitch",
    "posé": "male, medium pitch",
    "documentaire": "male, medium pitch",
    "intense": "male, high pitch",
    "rythmé": "male, medium pitch",
    "froid": "male, low pitch",
    "narratif": "male, medium pitch",
    "expressif": "male, medium pitch",
    "clair": "female, medium pitch",
    "chaleureux": "female, medium pitch, warm",
    "joyeux": "female, high pitch",
    "intrigant": "male, low pitch",
    "enjoué": "female, medium pitch",
}


def _wav_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        if rate <= 0:
            return 0.0
        return frames / float(rate)


def _tone_to_instruct(tone: str) -> str:
    raw = (tone or "").strip()
    default = os.getenv("OMNIVOICE_INSTRUCT", "male, low pitch").strip()
    if not raw:
        return default

    lower = raw.lower()
    # Attributs Omni déjà fournis explicitement
    omni_markers = (
        "pitch",
        "female",
        "male",
        "whisper",
        "accent",
        "child",
        "elderly",
        "british",
        "american",
        "warm",
    )
    if any(m in lower for m in omni_markers):
        return raw

    for key, instruct in _TONE_INSTRUCT.items():
        if key in lower:
            return instruct

    return default


def _get_omni():
    global _omni_model
    if _omni_model is not None:
        return _omni_model

    import torch
    from omnivoice import OmniVoice

    model_id = os.getenv("OMNIVOICE_MODEL_ID", "k2-fsa/OmniVoice").strip()
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device.startswith("cuda") else torch.float32

    log.info("Chargement OmniVoice %s sur %s…", model_id, device)
    _omni_model = OmniVoice.from_pretrained(
        model_id,
        device_map=device,
        dtype=dtype,
    )
    log.info("OmniVoice prêt")
    return _omni_model


def _generate_omnivoice(
    text: str,
    tone: str,
    output_path: Path,
    voice_instruct: str = "",
    speed: float | None = None,
) -> tuple[Path, float | None]:
    import numpy as np
    import soundfile as sf
    import torch

    model = _get_omni()
    num_step = int(os.getenv("OMNIVOICE_NUM_STEP", "32"))
    env_speed = float(os.getenv("OMNIVOICE_SPEED", "1.0"))
    use_speed = float(speed) if speed is not None and speed > 0 else env_speed
    sample_rate = int(os.getenv("OMNIVOICE_SAMPLE_RATE", "24000"))

    ref_audio = os.getenv("OMNIVOICE_REF_AUDIO", "").strip()
    ref_text = os.getenv("OMNIVOICE_REF_TEXT", "").strip()
    prompt_path = os.getenv("OMNIVOICE_VOICE_PROMPT", "").strip()

    kwargs: dict[str, Any] = {
        "text": text.strip(),
        "num_step": num_step,
        "speed": use_speed,
    }

    if prompt_path and Path(prompt_path).is_file():
        from omnivoice import VoiceClonePrompt

        log.info("OmniVoice clone via prompt %s", prompt_path)
        kwargs["voice_clone_prompt"] = VoiceClonePrompt.load(prompt_path)
    elif ref_audio and Path(ref_audio).is_file():
        log.info("OmniVoice clone via ref %s", ref_audio)
        kwargs["ref_audio"] = ref_audio
        if ref_text:
            kwargs["ref_text"] = ref_text
        # sinon Whisper ASR auto-transcrit
    else:
        instruct = (voice_instruct or "").strip() or _tone_to_instruct(tone)
        log.info(
            "OmniVoice voice-design instruct=%r speed=%.2f (tone=%r)",
            instruct,
            use_speed,
            tone,
        )
        kwargs["instruct"] = instruct

    log.info("OmniVoice → %s (%d chars, steps=%d)", output_path.name, len(text), num_step)
    audio_list = model.generate(**kwargs)
    audio = audio_list[0]
    if not isinstance(audio, np.ndarray):
        audio = np.asarray(audio)

    sf.write(str(output_path), audio, sample_rate)

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    duration = float(len(audio)) / float(sample_rate)
    log.info("Voix OmniVoice: %.2fs → %s", duration, output_path)
    return output_path, duration


def _generate_piper(
    text: str,
    tone: str,
    output_path: Path,
) -> tuple[Path, float | None]:
    piper_bin = os.getenv("PIPER_BIN", "piper")
    model_path = os.getenv("PIPER_MODEL_PATH", "")
    if not model_path:
        raise RuntimeError(
            "PIPER_MODEL_PATH manquant — ou passe à TTS_ENGINE=omnivoice"
        )

    model = Path(model_path)
    if not model.is_file():
        raise FileNotFoundError(f"Modèle Piper introuvable: {model}")

    if tone:
        log.info("Ton demandé=%r (ignoré en Piper)", tone)

    cmd = [
        piper_bin,
        "--model",
        str(model),
        "--output_file",
        str(output_path),
    ]

    log.info("Piper → %s (%d chars)", output_path.name, len(text))
    try:
        proc = subprocess.run(
            cmd,
            input=text.strip() + "\n",
            text=True,
            capture_output=True,
            check=False,
            timeout=300,
        )
    except FileNotFoundError as e:
        raise RuntimeError(
            f"Binaire Piper introuvable ({piper_bin})."
        ) from e

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Piper a échoué ({proc.returncode}): {err[:500]}")

    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("Piper n'a pas produit de fichier WAV")

    duration = _wav_duration_seconds(output_path)
    log.info("Voix Piper: %.2fs → %s", duration, output_path)
    return output_path, duration


def generate_voiceover(
    text: str,
    tone: str = "",
    output_path: Path | None = None,
    voice_instruct: str = "",
    speed: float | None = None,
) -> tuple[Path, float | None]:
    """
    Génère un WAV et renvoie (chemin, durée_secondes).

    TTS_ENGINE=omnivoice (défaut) | piper
    OmniVoice :
      - OMNIVOICE_REF_AUDIO (+ optionnel REF_TEXT) → clone (ignore instruct)
      - OMNIVOICE_VOICE_PROMPT (.pt) → clone pré-encodé
      - sinon voice-design via `voice_instruct` / `tone` + `speed`
    """
    if not text or not text.strip():
        raise ValueError("Texte de narration vide")

    out = Path(output_path) if output_path else Path("scene.wav")
    out.parent.mkdir(parents=True, exist_ok=True)

    engine = os.getenv("TTS_ENGINE", "omnivoice").strip().lower()
    if engine in ("piper", "piper-tts"):
        return _generate_piper(text, tone, out)
    if engine in ("omnivoice", "omni", "omni-voice"):
        return _generate_omnivoice(
            text,
            tone,
            out,
            voice_instruct=voice_instruct,
            speed=speed,
        )

    raise RuntimeError(f"TTS_ENGINE inconnu: {engine!r} (omnivoice|piper)")

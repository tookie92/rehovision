"""
TTS local via Piper (voix FR).
Prérequis : binaire `piper` + modèle .onnx (voir README / scripts/download_piper_fr.sh)
"""

from __future__ import annotations

import logging
import os
import subprocess
import wave
from pathlib import Path

log = logging.getLogger("rehovision-worker.voiceover")


def _wav_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        if rate <= 0:
            return 0.0
        return frames / float(rate)


def generate_voiceover(
    text: str,
    tone: str = "",
    output_path: Path | None = None,
) -> tuple[Path, float | None]:
    """
    Génère un WAV via Piper et renvoie (chemin, durée_secondes).

    `tone` est loggé pour usage futur (vitesse / voix multiples) — ignoré en v1.
    """
    if not text or not text.strip():
        raise ValueError("Texte de narration vide")

    out = Path(output_path) if output_path else Path("scene.wav")
    out.parent.mkdir(parents=True, exist_ok=True)

    piper_bin = os.getenv("PIPER_BIN", "piper")
    model_path = os.getenv("PIPER_MODEL_PATH", "")
    if not model_path:
        raise RuntimeError(
            "PIPER_MODEL_PATH manquant — téléchargez une voix FR "
            "(voir worker/scripts/download_piper_fr.sh)"
        )

    model = Path(model_path)
    if not model.is_file():
        raise FileNotFoundError(f"Modèle Piper introuvable: {model}")

    if tone:
        log.info("Ton demandé=%r (ignoré en v1 Piper)", tone)

    # piper lit le texte sur stdin, écrit le wav via --output_file
    cmd = [
        piper_bin,
        "--model",
        str(model),
        "--output_file",
        str(out),
    ]

    log.info("Piper → %s (%d chars)", out.name, len(text))
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
            f"Binaire Piper introuvable ({piper_bin}). "
            "Installez-le (voir worker/README.md)."
        ) from e

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Piper a échoué ({proc.returncode}): {err[:500]}")

    if not out.is_file() or out.stat().st_size == 0:
        raise RuntimeError("Piper n'a pas produit de fichier WAV")

    duration = _wav_duration_seconds(out)
    log.info("Voix générée: %.2fs → %s", duration, out)
    return out, duration

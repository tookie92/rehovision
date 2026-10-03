"""
Wrapper génération musicale.

Interface stable pour le reste du worker. Implémentations :
- MUSIC_ENGINE=fake (défaut) : WAV de test généré localement
- MUSIC_ENGINE=acestep : ACE-Step 1.5 (voir README + vendor/)
"""
from __future__ import annotations

import logging
import math
import os
import struct
import wave
from pathlib import Path
from typing import Optional

log = logging.getLogger("engines.music")

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_music(
    prompt: str,
    duration_s: int,
    seed: int | None = None,
) -> Path:
    """Génère un fichier audio et retourne son chemin local."""
    engine = os.environ.get("MUSIC_ENGINE", "fake").strip().lower()
    if engine == "acestep":
        return _generate_acestep(prompt, duration_s, seed)
    return _generate_fake(prompt, duration_s, seed)


def release_gpu() -> None:
    """Libère la VRAM entre deux jobs."""
    engine = os.environ.get("MUSIC_ENGINE", "fake").strip().lower()
    if engine != "acestep":
        return
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            log.info("VRAM libérée (empty_cache)")
    except Exception as exc:  # noqa: BLE001
        log.warning("release_gpu: %s", exc)


def _generate_fake(prompt: str, duration_s: int, seed: int | None) -> Path:
    """Produit un WAV stéréo 44.1 kHz (bip tonal) — pas de GPU."""
    duration_s = max(1, min(int(duration_s), 120))
    sample_rate = 44100
    rng_seed = seed if seed is not None else abs(hash(prompt)) % (2**31)
    # Fréquence dérivée du seed pour varier un peu
    freq = 220.0 + (rng_seed % 400)

    n_samples = sample_rate * duration_s
    out = OUTPUT_DIR / f"fake_{rng_seed}_{duration_s}s.wav"

    with wave.open(str(out), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(n_samples):
            t = i / sample_rate
            # Enveloppe douce + légère modulation
            env = min(1.0, t * 4) * min(1.0, (duration_s - t) * 4)
            val = 0.25 * env * math.sin(2 * math.pi * freq * t)
            val += 0.08 * env * math.sin(2 * math.pi * (freq * 1.5) * t)
            sample = int(max(-1.0, min(1.0, val)) * 32767)
            wf.writeframes(struct.pack("<hh", sample, sample))

    log.info("fake audio écrit: %s (prompt=%r)", out, prompt[:80])
    return out


def _generate_acestep(prompt: str, duration_s: int, seed: int | None) -> Path:
    """Délègue à ACE-Step 1.5 via l'API Python officielle."""
    from engines.acestep_backend import run_acestep

    return run_acestep(prompt=prompt, duration_s=duration_s, seed=seed)

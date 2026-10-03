"""
Génération voix Couche 1.

VOICE_ENGINE=
  auto       — OmniVoice si dispo, sinon Piper (FR), sinon stub
  omnivoice  — OmniVoice (auto-voice / instruct)
  piper      — Piper ONNX local (fr_FR-siwis)
  stub       — ton test (debug)

OmniVoice n'était PAS téléchargé (cache HF ~124Ko). Piper FR l'est.
"""
from __future__ import annotations

import logging
import math
import os
import struct
import wave
from pathlib import Path

log = logging.getLogger("engines.voice")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PIPER_DIR = ROOT / "models" / "piper"

_omnivoice_model = None


def generate_voice(
    text: str,
    source_lang: str,
    target_lang: str,
    duration_s: int | None = None,
    instruct: str | None = None,
) -> Path:
    engine = os.environ.get("VOICE_ENGINE", "auto").strip().lower()
    text = text.strip()
    if not text:
        raise ValueError("Texte vide")

    if engine == "stub":
        return _generate_stub(text, source_lang, target_lang, duration_s)
    if engine == "piper":
        return _generate_piper(text, target_lang)
    if engine == "omnivoice":
        return _generate_omnivoice(text, target_lang, instruct)

    # auto
    if _omnivoice_ready():
        try:
            return _generate_omnivoice(text, target_lang, instruct)
        except Exception as exc:  # noqa: BLE001
            log.warning("OmniVoice échec → Piper/stub: %s", exc)
    if target_lang.startswith("fr") and _piper_ready():
        return _generate_piper(text, target_lang)
    if _piper_ready() and target_lang.startswith("fr"):
        return _generate_piper(text, target_lang)
    log.warning(
        "Pas d'OmniVoice / Piper pour %s — stub. "
        "Télécharge OmniVoice ou utilise target_lang=fr avec Piper.",
        target_lang,
    )
    return _generate_stub(text, source_lang, target_lang, duration_s)


def release_voice_gpu() -> None:
    global _omnivoice_model
    if _omnivoice_model is None:
        return
    try:
        del _omnivoice_model
        _omnivoice_model = None
        import gc

        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        log.info("OmniVoice déchargé (VRAM)")
    except Exception as exc:  # noqa: BLE001
        log.warning("release_voice_gpu: %s", exc)


def _piper_ready() -> bool:
    model = PIPER_DIR / "fr_FR-siwis-medium.onnx"
    return model.is_file()


def _omnivoice_python() -> str | None:
    """Interpréteur du venv dédié (worker/venv_omnivoice), sinon le courant."""
    env = os.environ.get("OMNIVOICE_PYTHON", "").strip()
    if env and Path(env).is_file():
        return env
    marker = ROOT / ".omnivoice_python"
    if marker.is_file():
        p = marker.read_text().strip()
        if p and Path(p).is_file():
            return p
    return None


def _omnivoice_weights_ready() -> bool:
    hub = Path.home() / ".cache/huggingface/hub/models--k2-fsa--OmniVoice"
    if not hub.is_dir():
        return False
    for p in hub.rglob("*.safetensors"):
        try:
            if p.is_file() and p.stat().st_size > 100_000_000:
                return True
        except OSError:
            continue
    return False


def _omnivoice_ready() -> bool:
    if os.environ.get("OMNIVOICE_FORCE", "").strip() == "1":
        return True
    if not _omnivoice_weights_ready():
        return False
    # Importable dans ce process, ou via venv dédié
    try:
        import omnivoice  # noqa: F401
        return True
    except ImportError:
        return _omnivoice_python() is not None


def _generate_piper(text: str, target_lang: str) -> Path:
    if not _piper_ready():
        raise RuntimeError(f"Modèle Piper manquant dans {PIPER_DIR}")
    try:
        from piper import PiperVoice
    except ImportError as exc:
        raise RuntimeError(
            "piper-tts non installé dans le venv worker"
        ) from exc

    model_path = PIPER_DIR / "fr_FR-siwis-medium.onnx"
    if not target_lang.startswith("fr"):
        log.warning(
            "Piper: seul fr_FR-siwis est local — génération en français "
            "(cible demandée=%s)",
            target_lang,
        )

    voice = PiperVoice.load(str(model_path))
    out = OUTPUT_DIR / f"piper_fr_{abs(hash(text)) % 10_000_000}.wav"
    with wave.open(str(out), "wb") as wf:
        voice.synthesize_wav(text, wf)
    log.info("Piper OK → %s", out)
    return out


def _ensure_omnivoice():
    global _omnivoice_model
    if _omnivoice_model is not None:
        return _omnivoice_model
    try:
        import torch
        from omnivoice import OmniVoice
    except ImportError as exc:
        raise RuntimeError(
            "Paquet omnivoice absent. Voir worker/scripts/setup_omnivoice.sh"
        ) from exc

    device = os.environ.get("OMNIVOICE_DEVICE", "cuda:0")
    dtype = torch.float16 if "cuda" in device else torch.float32
    log.info("Chargement OmniVoice sur %s…", device)
    _omnivoice_model = OmniVoice.from_pretrained(
        os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"),
        device_map=device,
        dtype=dtype,
    )
    return _omnivoice_model


def _generate_omnivoice(
    text: str,
    target_lang: str,
    instruct: str | None,
) -> Path:
    # Venv dédié (Torch cu128) — évite de casser worker/.venv (Piper)
    py = _omnivoice_python()
    try:
        import omnivoice  # noqa: F401
        in_process = True
    except ImportError:
        in_process = False

    if not in_process and py:
        return _generate_omnivoice_subprocess(py, text, target_lang, instruct)

    import soundfile as sf

    model = _ensure_omnivoice()
    kwargs: dict = {"text": text}
    if instruct:
        kwargs["instruct"] = instruct
    audio = model.generate(**kwargs)
    wav = audio[0] if isinstance(audio, (list, tuple)) else audio
    out = OUTPUT_DIR / f"omnivoice_{target_lang}_{abs(hash(text)) % 10_000_000}.wav"
    sf.write(str(out), wav, 24000)
    log.info("OmniVoice OK → %s", out)
    return out


def _generate_omnivoice_subprocess(
    python_bin: str,
    text: str,
    target_lang: str,
    instruct: str | None,
) -> Path:
    import json
    import subprocess
    import tempfile

    out = OUTPUT_DIR / f"omnivoice_{target_lang}_{abs(hash(text)) % 10_000_000}.wav"
    payload = {
        "text": text,
        "out": str(out),
        "model": os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"),
        "device": os.environ.get("OMNIVOICE_DEVICE", "cuda:0"),
        "instruct": instruct,
    }
    script = r"""
import json, sys
import soundfile as sf
import torch
from omnivoice import OmniVoice
cfg = json.load(sys.stdin)
device = cfg["device"]
dtype = torch.float16 if "cuda" in device else torch.float32
model = OmniVoice.from_pretrained(cfg["model"], device_map=device, dtype=dtype)
kwargs = {"text": cfg["text"]}
if cfg.get("instruct"):
    kwargs["instruct"] = cfg["instruct"]
audio = model.generate(**kwargs)
wav = audio[0] if isinstance(audio, (list, tuple)) else audio
sf.write(cfg["out"], wav, 24000)
print(cfg["out"])
"""
    log.info("OmniVoice via subprocess %s", python_bin)
    proc = subprocess.run(
        [python_bin, "-c", script],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"OmniVoice subprocess failed: {proc.stderr[-2000:] or proc.stdout[-1000:]}"
        )
    if not out.is_file():
        raise RuntimeError("OmniVoice n'a pas écrit le WAV")
    log.info("OmniVoice OK → %s", out)
    return out


def _generate_stub(
    text: str,
    source_lang: str,
    target_lang: str,
    duration_s: int | None,
) -> Path:
    chars = max(len(text.strip()), 8)
    if duration_s is None:
        duration_s = max(3, min(45, int(chars / 14)))
    duration_s = max(2, min(int(duration_s), 60))
    sample_rate = 22050
    freq = 180.0 + (sum(ord(c) for c in target_lang) % 120)
    n_samples = sample_rate * duration_s
    out = OUTPUT_DIR / f"voice_stub_{target_lang}_{duration_s}s.wav"
    with wave.open(str(out), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(n_samples):
            t = i / sample_rate
            env = min(1.0, t * 8) * min(1.0, (duration_s - t) * 6)
            pulse = 0.5 + 0.5 * math.sin(2 * math.pi * 4 * t)
            val = 0.22 * env * pulse * math.sin(2 * math.pi * freq * t)
            sample = int(max(-1.0, min(1.0, val)) * 32767)
            wf.writeframes(struct.pack("<h", sample))
    log.info("voice STUB %s→%s → %s", source_lang, target_lang, out.name)
    return out

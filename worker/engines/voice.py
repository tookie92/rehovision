"""
Génération voix Couche 1.

VOICE_ENGINE=
  auto       — OmniVoice si dispo, sinon Piper (FR sans clone), sinon ERREUR
  omnivoice  — OmniVoice (clone / instruct / auto)
  piper      — Piper ONNX local (fr_FR-siwis)
  stub       — ton test (debug explicite seulement)

Jamais de stub silencieux en production : on lève une erreur claire (ex. OOM).
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

# ISO atelier → code OmniVoice LANG_IDS (évite mode agnostique = son bizarre)
_OMNI_LANG_ALIAS: dict[str, str] = {
    "wof": "wo",
    "ar": "arb",
    "nd": "zu",
    "nr": "zu",
    "st": "zu",
    "tn": "zu",
}
# Proxies Nguni quand le code exact n'existe pas dans LANG_IDS
_OMNI_NGUNI_PROXY = frozenset({"nd", "nr", "st", "tn"})

_omnivoice_model = None


def generate_voice(
    text: str,
    source_lang: str,
    target_lang: str,
    duration_s: int | None = None,
    instruct: str | None = None,
    ref_audio: Path | str | None = None,
    ref_text: str | None = None,
    speed: float | None = None,
) -> Path:
    engine = os.environ.get("VOICE_ENGINE", "auto").strip().lower()
    text = text.strip()
    if not text:
        raise ValueError("Texte vide")

    ref_path = Path(ref_audio) if ref_audio else None
    if ref_path is not None and not ref_path.is_file():
        raise RuntimeError(f"Audio de référence introuvable: {ref_path}")

    speed_f = _clamp_speed(speed)

    if engine == "stub":
        return _generate_stub(text, source_lang, target_lang, duration_s)
    if engine == "piper":
        if ref_path:
            raise RuntimeError(
                "Piper ne peut pas cloner une voix. Désactive le clone "
                "ou utilise OmniVoice."
            )
        return _generate_piper(text, target_lang)
    if engine == "omnivoice":
        return _generate_omnivoice(
            text, target_lang, instruct, ref_path, ref_text, speed=speed_f
        )

    # auto
    if not _omnivoice_ready():
        if target_lang.startswith("fr") and _piper_ready() and not ref_path:
            return _generate_piper(text, target_lang)
        raise RuntimeError(
            "OmniVoice indisponible (poids / venv). "
            "Voir worker/scripts/setup_omnivoice.sh"
        )

    try:
        return _generate_omnivoice(
            text, target_lang, instruct, ref_path, ref_text, speed=speed_f
        )
    except Exception as exc:  # noqa: BLE001
        msg = _friendly_voice_error(exc, clone=bool(ref_path), lang=target_lang)
        log.error("OmniVoice échec: %s", msg)
        # Piper FR uniquement si PAS de clone demandé
        if (
            not ref_path
            and target_lang.startswith("fr")
            and _piper_ready()
            and "out of memory" not in str(exc).lower()
            and "oom" not in str(exc).lower()
        ):
            log.warning("Repli Piper FR (sans clone)")
            return _generate_piper(text, target_lang)
        raise RuntimeError(msg) from exc


def _friendly_voice_error(exc: BaseException, *, clone: bool, lang: str) -> str:
    raw = str(exc)
    low = raw.lower()
    if "out of memory" in low or "oom" in low:
        return (
            "GPU saturée (CUDA OOM) pendant "
            f"{'le clonage de voix' if clone else 'OmniVoice'} "
            f"(cible {lang}). Réessaie dans quelques secondes, ou choisis "
            "« Voix modèle » sans clone. Libère la VRAM (ferme un autre job GPU)."
        )
    if clone:
        return (
            f"Clonage OmniVoice échoué ({lang}): {raw[:280]}. "
            "Réessaie, ou passe en « Voix modèle »."
        )
    return f"OmniVoice échoué ({lang}): {raw[:320]}"


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


def _omnivoice_lang_ids() -> frozenset[str]:
    try:
        from omnivoice.utils.lang_map import LANG_IDS

        return frozenset(LANG_IDS.keys())
    except Exception:  # noqa: BLE001
        return frozenset()


def resolve_omnivoice_language(target_lang: str) -> str:
    """Code LANG_IDS OmniVoice ou erreur explicite (jamais None / agnostique)."""
    raw = (target_lang or "").split("-")[0].lower().strip()
    if not raw:
        raise RuntimeError("Langue TTS vide")
    code = _OMNI_LANG_ALIAS.get(raw, raw)
    ids = _omnivoice_lang_ids()
    if ids and code in ids:
        if raw != code and raw in _OMNI_LANG_ALIAS:
            log.info("OmniVoice lang %s → %s", raw, code)
        elif raw in _OMNI_NGUNI_PROXY and code == "zu":
            log.warning(
                "Langue %s → proxy OmniVoice zu (Ndebele/Nguni, qualité variable)",
                raw,
            )
        return code
    if ids and raw in _OMNI_NGUNI_PROXY and "zu" in ids:
        log.warning(
            "Langue %s → proxy OmniVoice zu (Ndebele/Nguni, qualité variable)",
            raw,
        )
        return "zu"
    if ids:
        sample = ", ".join(sorted(list(ids)[:12]))
        raise RuntimeError(
            f"Langue TTS « {target_lang} » non supportée par OmniVoice "
            f"(ex. fr, en, wo, sw, sn, yo, ha, ln, pt, ar→arb). "
            f"Catalogue partiel : {sample}…"
        )
    # Pas d'import omnivoice dans ce venv — le subprocess validera
    return code


def _omnivoice_language_arg(target_lang: str) -> str:
    return resolve_omnivoice_language(target_lang)


def prepare_ref_audio(ref_audio: Path) -> Path:
    """WAV mono court pour clone (évite OOM DAC sur ref longue)."""
    import subprocess

    # 8–12 s suffisent pour un clone ; au-delà le DAC explose la VRAM
    max_s = float(os.environ.get("OMNIVOICE_REF_MAX_S", "10"))
    out = OUTPUT_DIR / f"ref_{ref_audio.stem}_{int(max_s)}s.wav"
    proc = subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(ref_audio),
            "-t", str(max_s),
            "-ac", "1", "-ar", "24000",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not out.is_file():
        raise RuntimeError(
            "Impossible de préparer l'audio de référence. "
            f"ffmpeg: {(proc.stderr or '')[:200]}"
        )
    log.info(
        "ref_audio prêt %s → %s (max %.0fs)",
        ref_audio.name,
        out.name,
        max_s,
    )
    return out


def prepare_clone_ref(
    ref_audio: Path,
    *,
    source_lang: str | None = None,
) -> tuple[Path, str]:
    """Prépare la ref + Whisper aligné sur le même extrait (obligatoire pour clone)."""
    from engines.stt import transcribe

    ref_path = prepare_ref_audio(ref_audio)
    ref_text = transcribe(
        ref_path,
        language=(source_lang or None),
    )
    log.info("Clone ref_text aligné — %d chars: %s", len(ref_text), ref_text[:100])
    return ref_path, ref_text


def _clamp_speed(speed: float | None) -> float | None:
    if speed is None:
        return None
    try:
        s = float(speed)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(s):
        return None
    return max(0.5, min(2.0, s))


def _generate_omnivoice(
    text: str,
    target_lang: str,
    instruct: str | None,
    ref_audio: Path | None = None,
    ref_text: str | None = None,
    speed: float | None = None,
) -> Path:
    from engines.gpu_util import free_vram

    free_vram("avant OmniVoice")

    ref_path = Path(ref_audio) if ref_audio else None

    py = _omnivoice_python()
    try:
        import omnivoice  # noqa: F401
        in_process = True
    except ImportError:
        in_process = False

    if not in_process and py:
        return _generate_omnivoice_subprocess(
            py, text, target_lang, instruct, ref_path, ref_text, speed=speed
        )

    import soundfile as sf

    model = _ensure_omnivoice()
    language = _omnivoice_language_arg(target_lang)
    kwargs: dict = {"text": text, "language": language}
    if speed is not None and speed != 1.0:
        kwargs["speed"] = speed
    if ref_path is not None:
        kwargs["ref_audio"] = str(ref_path)
        if not (ref_text and ref_text.strip()):
            raise RuntimeError(
                "Clone OmniVoice: ref_text manquant (doit être la transcription "
                "exacte de l'extrait de référence)."
            )
        kwargs["ref_text"] = ref_text.strip()
        log.info(
            "OmniVoice CLONE ref=%s ref_text=%d chars language=%s spoken=%d speed=%s",
            ref_path.name,
            len(ref_text or ""),
            language,
            len(text),
            speed,
        )
    elif instruct:
        kwargs["instruct"] = instruct
        log.info("OmniVoice DESIGN instruct=%s language=%s speed=%s", instruct, language, speed)
    else:
        log.info("OmniVoice AUTO language=%s speed=%s", language, speed)

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
    ref_audio: Path | None = None,
    ref_text: str | None = None,
    speed: float | None = None,
) -> Path:
    import json
    import subprocess

    out = OUTPUT_DIR / f"omnivoice_{target_lang}_{abs(hash(text)) % 10_000_000}.wav"
    language = _omnivoice_language_arg(target_lang)
    payload = {
        "text": text,
        "out": str(out),
        "model": os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"),
        "device": os.environ.get("OMNIVOICE_DEVICE", "cuda:0"),
        "instruct": instruct,
        "language": language,
        "ref_audio": str(ref_audio) if ref_audio else None,
        "ref_text": (ref_text or "").strip() or None,
        "speed": speed,
        "tokenizer_cpu": os.environ.get("OMNIVOICE_TOKENIZER_CPU", "1") != "0",
    }
    script = r"""
import json, sys, gc, os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
import soundfile as sf
import torch
from omnivoice import OmniVoice
from omnivoice.utils.lang_map import LANG_IDS
cfg = json.load(sys.stdin)
if torch.cuda.is_available():
    torch.cuda.empty_cache()
device = cfg["device"]
dtype = torch.float16 if "cuda" in device else torch.float32
# Tokenizer audio (DAC) sur CPU → laisse la VRAM au DiT (12 Go + Ollama)
tok_on_cpu = cfg.get("tokenizer_cpu", True)
model = OmniVoice.from_pretrained(cfg["model"], device_map=device, dtype=dtype)
if tok_on_cpu and hasattr(model, "audio_tokenizer"):
    try:
        model.audio_tokenizer.to("cpu")
        print("audio_tokenizer → cpu", file=sys.stderr)
    except Exception as e:
        print("tokenizer cpu move failed:", e, file=sys.stderr)
lang = cfg.get("language")
if not lang or lang not in LANG_IDS:
    raise SystemExit(
        f"Langue OmniVoice invalide ou absente: {lang!r}. "
        "Le worker doit résoudre ar→arb, wof→wo, etc."
    )
kwargs = {"text": cfg["text"], "language": lang}
if cfg.get("speed") is not None and float(cfg["speed"]) != 1.0:
    kwargs["speed"] = float(cfg["speed"])
if cfg.get("ref_audio"):
    if not cfg.get("ref_text"):
        raise SystemExit("ref_text required for clone")
    kwargs["ref_audio"] = cfg["ref_audio"]
    kwargs["ref_text"] = cfg["ref_text"]
elif cfg.get("instruct"):
    kwargs["instruct"] = cfg["instruct"]
audio = model.generate(**kwargs)
wav = audio[0] if isinstance(audio, (list, tuple)) else audio
sf.write(cfg["out"], wav, 24000)
del model
gc.collect()
if torch.cuda.is_available():
    torch.cuda.empty_cache()
print(cfg["out"])
"""
    mode = "CLONE" if ref_audio else ("DESIGN" if instruct else "AUTO")
    log.info("OmniVoice %s via subprocess %s speed=%s", mode, python_bin, speed)
    env = os.environ.copy()
    env.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    proc = subprocess.run(
        [python_bin, "-c", script],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        env=env,
    )
    if proc.returncode != 0:
        err = proc.stderr[-2500:] or proc.stdout[-1000:]
        raise RuntimeError(err or "OmniVoice subprocess failed")
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

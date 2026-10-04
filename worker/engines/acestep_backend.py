"""
Intégration ACE-Step 1.5 — API Python officielle.

Source consultée :
https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/INFERENCE.md

  dit_handler.initialize_service(...)
  llm_handler.initialize(...)
  generate_music(dit_handler, llm_handler, GenerationParams, GenerationConfig)
  → GenerationResult (result.success, result.audios[].path)
"""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

log = logging.getLogger("engines.acestep")

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _caption_for_vocals(caption: str) -> str:
    import re

    c = caption.strip()
    c = re.sub(r"(?i)\binstrumentals?\b", "", c)
    c = re.sub(r"(?i)\b(no|without|sans)\s+vocals?\b", "", c)
    c = re.sub(r"\s{2,}", " ", c).strip(" ,;-")
    if not re.search(r"(?i)\b(vocal|vocals|sing|sung|chant|voice|voix)\b", c):
        c = f"{c}, with clear sung vocals".strip(", ")
    return c[:500]

_dit_handler: Any = None
_llm_handler: Any = None


def _project_root() -> str:
    return os.environ.get(
        "ACESTEP_PROJECT_ROOT",
        str(Path(__file__).resolve().parent.parent / "vendor" / "ACE-Step-1.5"),
    )


def _ensure_handlers() -> tuple[Any, Any]:
    global _dit_handler, _llm_handler
    if _dit_handler is not None:
        return _dit_handler, _llm_handler

    try:
        from acestep.handler import AceStepHandler
        from acestep.llm_inference import LLMHandler
    except ImportError as exc:
        raise RuntimeError(
            "ACE-Step non installé. Voir README § ACE-Step — "
            "https://github.com/ace-step/ACE-Step-1.5 — "
            f"import error: {exc}"
        ) from exc

    root = _project_root()
    config_path = os.environ.get("ACESTEP_CONFIG_PATH", "acestep-v15-turbo")
    lm_model = os.environ.get("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-0.6B")
    lm_backend = os.environ.get("ACESTEP_LM_BACKEND", "pt")
    device = os.environ.get("ACESTEP_DEVICE", "cuda")
    checkpoint_dir = os.environ.get(
        "ACESTEP_CHECKPOINT_DIR",
        str(Path(root) / "checkpoints"),
    )

    dit = AceStepHandler()
    dit.initialize_service(
        project_root=root,
        config_path=config_path,
        device=device,
    )

    llm = LLMHandler()
    llm.initialize(
        checkpoint_dir=checkpoint_dir,
        lm_model_path=lm_model,
        backend=lm_backend,
        device=device,
    )

    _dit_handler = dit
    _llm_handler = llm
    log.info(
        "ACE-Step prêt — config=%s lm=%s backend=%s",
        config_path,
        lm_model,
        lm_backend,
    )
    return _dit_handler, _llm_handler


def _ace_python() -> Path | None:
    env = os.environ.get("ACESTEP_PYTHON", "").strip()
    if env and Path(env).is_file():
        return Path(env)
    candidate = Path(_project_root()) / ".venv" / "bin" / "python"
    return candidate if candidate.is_file() else None


def run_acestep(
    prompt: str,
    duration_s: int,
    seed: int | None,
    *,
    lyrics: str | None = None,
    instrumental: bool = True,
    bpm: int | None = None,
    keyscale: str | None = None,
    timesignature: str | int | None = None,
    inference_steps: int | None = None,
) -> Path:
    duration_s = max(1, min(int(duration_s), 600))
    lyr = (lyrics or "").strip()
    caption = (prompt or "").strip()[:500]
    if instrumental or not lyr or lyr.lower() in ("[instrumental]", "instrumental"):
        lyr = "[Instrumental]"
        instrumental = True
    else:
        caption = _caption_for_vocals(caption)
    fade_out = max(1.5, min(4.0, float(duration_s) * 0.1))
    fade_in = 0.05
    steps = int(
        inference_steps
        if inference_steps is not None
        else os.environ.get("ACESTEP_INFERENCE_STEPS", "8")
    )

    # Hors process worker (.venv a Piper, pas acestep) → venv ACE-Step
    try:
        import acestep  # noqa: F401
    except ImportError:
        return _run_acestep_subprocess(
            caption,
            duration_s,
            seed,
            lyrics=lyr,
            instrumental=instrumental,
            bpm=bpm,
            keyscale=keyscale,
            timesignature=timesignature,
            inference_steps=steps,
            fade_out_duration=fade_out,
            fade_in_duration=fade_in,
        )

    from acestep.inference import GenerationConfig, GenerationParams, generate_music

    dit, llm = _ensure_handlers()
    save_dir = OUTPUT_DIR / "acestep_tmp"
    save_dir.mkdir(parents=True, exist_ok=True)

    params_kw: dict[str, Any] = {
        "caption": caption,
        "lyrics": lyr[:4096],
        "instrumental": instrumental,
        "duration": float(duration_s),
        "seed": int(seed) if seed is not None else -1,
        "inference_steps": steps,
        "fade_in_duration": fade_in,
        "fade_out_duration": fade_out,
    }
    if bpm is not None:
        params_kw["bpm"] = int(bpm)
    if keyscale:
        params_kw["keyscale"] = str(keyscale).strip()
    if timesignature is not None and timesignature != "":
        params_kw["timesignature"] = timesignature

    log.info(
        "ACE-Step params instr=%s lyrics_len=%d fade_out=%.1fs caption=%r",
        instrumental,
        len(lyr),
        fade_out,
        caption[:80],
    )
    params = GenerationParams(**params_kw)
    config = GenerationConfig(
        batch_size=1,
        audio_format=os.environ.get("ACESTEP_AUDIO_FORMAT", "wav"),
    )

    result = generate_music(
        dit,
        llm,
        params,
        config,
        save_dir=str(save_dir),
    )

    if not getattr(result, "success", False):
        err = getattr(result, "error", "erreur inconnue")
        raise RuntimeError(f"ACE-Step a échoué: {err}")

    audios = getattr(result, "audios", None) or []
    if not audios:
        raise RuntimeError("ACE-Step: aucun audio dans GenerationResult.audios")

    first = audios[0]
    src = Path(first["path"] if isinstance(first, dict) else first)
    if not src.exists():
        raise RuntimeError(f"Fichier ACE-Step introuvable: {src}")

    out = OUTPUT_DIR / f"acestep_{duration_s}s_{src.name}"
    shutil.copy2(src, out)
    log.info("ACE-Step audio: %s", out)
    return out


def _run_acestep_subprocess(
    prompt: str,
    duration_s: int,
    seed: int | None,
    *,
    lyrics: str = "[Instrumental]",
    instrumental: bool = True,
    bpm: int | None = None,
    keyscale: str | None = None,
    timesignature: str | int | None = None,
    inference_steps: int = 8,
    fade_out_duration: float = 2.5,
    fade_in_duration: float = 0.05,
) -> Path:
    import json
    import subprocess

    py = _ace_python()
    if not py:
        raise RuntimeError(
            "ACE-Step venv introuvable. Attendre le download / uv sync."
        )
    script = Path(__file__).resolve().parent.parent / "scripts" / "acestep_generate.py"
    save_dir = OUTPUT_DIR / "acestep_tmp"
    save_dir.mkdir(parents=True, exist_ok=True)
    out = OUTPUT_DIR / f"acestep_{duration_s}s_{abs(hash(prompt)) % 10_000_000}.wav"
    root = _project_root()
    payload = {
        "prompt": prompt,
        "duration_s": duration_s,
        "seed": seed,
        "lyrics": lyrics,
        "instrumental": instrumental,
        "bpm": bpm,
        "keyscale": keyscale or "",
        "timesignature": timesignature if timesignature is not None else "",
        "fade_out_duration": fade_out_duration,
        "fade_in_duration": fade_in_duration,
        "out": str(out),
        "save_dir": str(save_dir),
        "project_root": root,
        "checkpoint_dir": os.environ.get(
            "ACESTEP_CHECKPOINT_DIR",
            str(Path(root) / "checkpoints"),
        ),
        "config_path": os.environ.get("ACESTEP_CONFIG_PATH", "acestep-v15-turbo"),
        "lm_model_path": os.environ.get("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-0.6B"),
        "lm_backend": os.environ.get("ACESTEP_LM_BACKEND", "pt"),
        "device": os.environ.get("ACESTEP_DEVICE", "cuda"),
        "inference_steps": inference_steps,
        "audio_format": os.environ.get("ACESTEP_AUDIO_FORMAT", "wav"),
    }
    log.info("ACE-Step via subprocess %s", py)
    proc = subprocess.run(
        [str(py), str(script)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        cwd=root,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"ACE-Step subprocess failed: {proc.stderr[-2500:] or proc.stdout[-1000:]}"
        )
    if not out.is_file():
        raise RuntimeError("ACE-Step n'a pas écrit le WAV")
    log.info("ACE-Step audio: %s", out)
    return out


def unload_handlers() -> None:
    global _dit_handler, _llm_handler
    _dit_handler = None
    _llm_handler = None
    try:
        import gc

        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass

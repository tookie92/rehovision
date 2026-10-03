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


def run_acestep(prompt: str, duration_s: int, seed: int | None) -> Path:
    from acestep.inference import GenerationConfig, GenerationParams, generate_music

    dit, llm = _ensure_handlers()
    duration_s = max(1, min(int(duration_s), 600))
    save_dir = OUTPUT_DIR / "acestep_tmp"
    save_dir.mkdir(parents=True, exist_ok=True)

    params = GenerationParams(
        caption=prompt[:500],
        lyrics="[Instrumental]",
        instrumental=True,
        duration=float(duration_s),
        seed=int(seed) if seed is not None else -1,
        inference_steps=int(os.environ.get("ACESTEP_INFERENCE_STEPS", "8")),
    )
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

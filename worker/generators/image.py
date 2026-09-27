"""
Génération d'image locale via Hugging Face Diffusers (SDXL Turbo).
Lazy singleton — le modèle reste en VRAM entre les jobs.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger("rehovision-worker.image")

_pipeline: Any = None


def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    import torch
    from diffusers import AutoPipelineForText2Image

    model_id = os.getenv("SD_MODEL_ID", "stabilityai/sdxl-turbo")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    log.info("Chargement Diffusers %s sur %s…", model_id, device)
    pipe = AutoPipelineForText2Image.from_pretrained(
        model_id,
        torch_dtype=dtype,
        variant="fp16" if device == "cuda" else None,
    )
    pipe = pipe.to(device)
    # Économie VRAM 3060
    if device == "cuda":
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass

    _pipeline = pipe
    log.info("Pipeline prêt")
    return _pipeline


def generate_image(
    prompt: str,
    style_reference: str | None = None,
    output_path: Path | None = None,
) -> Path:
    """
    Produit une image verticale 9:16 et renvoie son chemin local.
    """
    if not prompt or not prompt.strip():
        raise ValueError("Prompt d'image vide")

    if style_reference:
        log.warning(
            "style_reference ignoré en v1 (pas d'IP-Adapter): %s",
            style_reference[:120],
        )

    out = Path(output_path) if output_path else Path("scene.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    width = int(os.getenv("SD_WIDTH", "576"))
    height = int(os.getenv("SD_HEIGHT", "1024"))
    steps = int(os.getenv("SD_STEPS", "4"))
    # SDXL Turbo : guidance_scale=0 recommandé
    guidance = float(os.getenv("SD_GUIDANCE", "0"))

    import torch

    pipe = _get_pipeline()
    log.info(
        "Génération image %dx%d steps=%d — %s",
        width,
        height,
        steps,
        prompt[:100],
    )

    result = pipe(
        prompt=prompt.strip(),
        num_inference_steps=steps,
        guidance_scale=guidance,
        width=width,
        height=height,
    )
    image = result.images[0]
    image.save(out, format="PNG")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    log.info("Image sauvée → %s (%d bytes)", out, out.stat().st_size)
    return out

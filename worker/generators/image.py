"""
Génération d'image locale via Hugging Face Diffusers.

Image de référence Studio = STYLE DE DESSIN uniquement
(ex. anime uploadé → rendu dans ce style), JAMAIS le contenu / composition
recopié sur chaque scène.

Modes (SD_REF_MODE) :
  style     — IP-Adapter (SDXL) + consignes prompt ; défaut
  prompt    — consignes prompt seulement (pas de conditionnement image)
  img2img   — ancien mode (contenu ancré) — déconseillé
  off       — ignore la référence
"""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

log = logging.getLogger("rehovision-worker.image")

_pipeline: Any = None
_pipeline_kind: str | None = None
_ip_adapter_loaded: bool = False

DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"

STYLE_ONLY_SUFFIX = (
    "Drawing style from studio style-reference. New scene — do not copy reference subjects."
)


def _is_flux(model_id: str) -> bool:
    return "flux" in model_id.lower()


def _cpu_offload_enabled() -> bool:
    return os.getenv("SD_CPU_OFFLOAD", "1").strip() not in (
        "0",
        "false",
        "False",
    )


def _ref_mode() -> str:
    # Défaut "prompt" : pas de download IP-Adapter bloquant.
    # "style" active IP-Adapter (lourd, lent la 1re fois).
    return os.getenv("SD_REF_MODE", "prompt").strip().lower() or "prompt"


def _harden_vae(pipe: Any) -> None:
    try:
        if hasattr(pipe, "vae") and hasattr(pipe.vae, "config"):
            pipe.vae.config.force_upcast = False
    except Exception:
        pass
    for name in ("enable_vae_slicing", "enable_vae_tiling", "enable_attention_slicing"):
        fn = getattr(pipe, name, None)
        if callable(fn):
            try:
                fn()
            except Exception:
                pass


def _apply_device(pipe: Any, device: str) -> Any:
    if device == "cuda" and _cpu_offload_enabled():
        try:
            pipe.enable_model_cpu_offload()
            return pipe
        except Exception as exc:
            log.warning("cpu_offload indisponible (%s) — .to(cuda)", exc)
    pipe = pipe.to(device)
    _harden_vae(pipe)
    return pipe


def _get_pipeline():
    global _pipeline, _pipeline_kind, _ip_adapter_loaded
    if _pipeline is not None:
        return _pipeline

    import torch

    model_id = os.getenv("SD_MODEL_ID", DEFAULT_MODEL).strip()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and torch.cuda.is_bf16_supported():
        dtype = torch.bfloat16
    elif device == "cuda":
        dtype = torch.float16
    else:
        dtype = torch.float32

    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN") or None

    log.info(
        "Chargement Diffusers %s sur %s (dtype=%s, cpu_offload=%s)…",
        model_id,
        device,
        dtype,
        _cpu_offload_enabled() and device == "cuda",
    )

    if _is_flux(model_id):
        from diffusers import FluxPipeline

        pipe = FluxPipeline.from_pretrained(
            model_id,
            torch_dtype=dtype,
            token=token,
        )
        pipe = _apply_device(pipe, device)
        _pipeline_kind = "flux"
    else:
        from diffusers import AutoPipelineForText2Image

        kwargs: dict[str, Any] = {
            "torch_dtype": dtype,
            "token": token,
        }
        if device == "cuda" and dtype == torch.float16:
            kwargs["variant"] = "fp16"
        pipe = AutoPipelineForText2Image.from_pretrained(model_id, **kwargs)
        pipe = _apply_device(pipe, device)
        _pipeline_kind = "auto"

    _harden_vae(pipe)
    _pipeline = pipe
    _ip_adapter_loaded = False
    log.info("Pipeline prêt (%s)", _pipeline_kind)
    return _pipeline


def _ensure_ip_adapter(pipe: Any) -> bool:
    """Charge IP-Adapter SDXL une fois (style conditioning)."""
    global _ip_adapter_loaded
    if _ip_adapter_loaded:
        return True
    if _pipeline_kind == "flux" or _is_flux(os.getenv("SD_MODEL_ID", "")):
        return False
    if not hasattr(pipe, "load_ip_adapter"):
        return False

    weight = os.getenv(
        "SD_IP_ADAPTER_WEIGHT",
        "ip-adapter-plus_sdxl_vit-h.safetensors",
    ).strip()
    repo = os.getenv("SD_IP_ADAPTER_REPO", "h94/IP-Adapter").strip()
    subfolder = os.getenv("SD_IP_ADAPTER_SUBFOLDER", "sdxl_models").strip()

    try:
        log.info("Chargement IP-Adapter %s/%s…", repo, weight)
        pipe.load_ip_adapter(repo, subfolder=subfolder, weight_name=weight)
        _ip_adapter_loaded = True
        # Re-appliquer offload après load
        if _cpu_offload_enabled():
            try:
                pipe.enable_model_cpu_offload()
            except Exception:
                pass
        return True
    except Exception as exc:
        log.warning("IP-Adapter indisponible (%s) — style via prompt seul", exc)
        return False


def _set_ip_scale(pipe: Any, scale: float) -> None:
    if hasattr(pipe, "set_ip_adapter_scale"):
        try:
            pipe.set_ip_adapter_scale(scale)
        except Exception as exc:
            log.warning("set_ip_adapter_scale: %s", exc)


def _download_reference(url: str, max_side: int = 768):
    """Charge la ref pour IP-Adapter (carré raisonnable, pas besoin du 9:16 scène)."""
    from PIL import Image

    req = Request(url, headers={"User-Agent": "rehovision-worker/1.0"})
    with urlopen(req, timeout=60) as resp:
        data = resp.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))),
            Image.Resampling.LANCZOS,
        )
    return img


def _with_style_prompt(prompt: str) -> str:
    p = prompt.strip()
    if STYLE_ONLY_SUFFIX.lower() in p.lower():
        return p
    return f"{p}. {STYLE_ONLY_SUFFIX}"


def generate_image(
    prompt: str,
    style_reference: str | None = None,
    output_path: Path | None = None,
) -> Path:
    if not prompt or not prompt.strip():
        raise ValueError("Prompt d'image vide")

    out = Path(output_path) if output_path else Path("scene.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    width = int(os.getenv("SD_WIDTH", "576"))
    height = int(os.getenv("SD_HEIGHT", "1024"))
    steps = int(os.getenv("SD_STEPS", "4"))
    guidance = float(os.getenv("SD_GUIDANCE", "0"))
    max_seq = int(os.getenv("SD_MAX_SEQUENCE_LENGTH", "256"))
    ip_scale = float(os.getenv("SD_IP_ADAPTER_SCALE", "0.45"))
    mode = _ref_mode()

    import torch

    model_id = os.getenv("SD_MODEL_ID", DEFAULT_MODEL)
    pipe = _get_pipeline()

    use_ref = bool(style_reference and style_reference.strip()) and mode != "off"
    final_prompt = (
        _with_style_prompt(prompt) if use_ref else prompt.strip()
    )

    gen_kwargs: dict[str, Any] = {
        "prompt": final_prompt,
        "num_inference_steps": steps,
        "guidance_scale": guidance,
        "width": width,
        "height": height,
    }

    if _is_flux(model_id) or _pipeline_kind == "flux":
        gen_kwargs["max_sequence_length"] = max_seq

    seed_raw = os.getenv("SD_SEED", "").strip()
    if seed_raw:
        gen_kwargs["generator"] = torch.Generator(device="cpu").manual_seed(
            int(seed_raw)
        )

    # Style ref : IP-Adapter (pas img2img) pour ne pas coller le contenu
    used_ip = False
    if use_ref and mode in ("style", "ipadapter", "ip-adapter"):
        try:
            ref_img = _download_reference(style_reference.strip())
            if _ensure_ip_adapter(pipe):
                _set_ip_scale(pipe, ip_scale)
                gen_kwargs["ip_adapter_image"] = ref_img
                used_ip = True
                log.info(
                    "Style ref via IP-Adapter (scale=%.2f) — %s",
                    ip_scale,
                    style_reference[:100],
                )
            else:
                log.info(
                    "Style ref via prompt seul (pas d'IP-Adapter) — %s",
                    style_reference[:100],
                )
        except Exception as exc:
            log.warning("Référence style ignorée (%s)", exc)

    elif use_ref and mode == "prompt":
        log.info("Style ref via prompt seul (SD_REF_MODE=prompt)")

    elif use_ref and mode == "img2img":
        log.warning(
            "SD_REF_MODE=img2img est déconseillé (contenu recopié) — "
            "utilise 'style'. Fallback prompt seul."
        )

    # Pas de ref / pas d'IP : s'assurer que l'échelle IP est à 0 si chargé
    if _ip_adapter_loaded and not used_ip:
        _set_ip_scale(pipe, 0.0)

    log.info(
        "Génération image %dx%d steps=%d guidance=%s ip=%s — %s",
        width,
        height,
        steps,
        guidance,
        used_ip,
        final_prompt[:100],
    )

    try:
        result = pipe(**gen_kwargs)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        if used_ip:
            log.warning("OOM avec IP-Adapter — retry txt2img + prompt style")
            _set_ip_scale(pipe, 0.0)
            gen_kwargs.pop("ip_adapter_image", None)
            result = pipe(**gen_kwargs)
        else:
            raise
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    image = result.images[0]
    image.save(out, format="PNG")
    log.info("Image sauvée → %s (%d bytes)", out, out.stat().st_size)
    return out

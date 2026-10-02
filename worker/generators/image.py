"""
Génération d'image locale via Hugging Face Diffusers.

Sans référence style → Flux Schnell (rapide).
Avec référence style → SDXL + IP-Adapter (conditionnement image).

Modes (SD_REF_MODE) quand une ref est fournie :
  style     — IP-Adapter (SDXL) + consignes prompt ; recommandé
  prompt    — consignes prompt seulement (pas de conditionnement image)
  img2img   — ancien mode (contenu ancré) — déconseillé
  off       — ignore la référence
"""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Any, Literal
from urllib.request import Request, urlopen

from generators.gpu_mem import empty_cuda, log_vram, unload_ollama

log = logging.getLogger("rehovision-worker.image")

_pipeline_flux: Any = None
_pipeline_sdxl: Any = None
_active_kind: Literal["flux", "sdxl"] | None = None
_ip_adapter_loaded: bool = False

DEFAULT_FLUX_MODEL = "black-forest-labs/FLUX.1-schnell"
DEFAULT_SDXL_MODEL = "stabilityai/stable-diffusion-xl-base-1.0"

STYLE_ONLY_SUFFIX = (
    "Drawing style from studio style-reference. New scene — do not copy reference subjects."
)


def unload_pipeline() -> None:
    """Libère Flux/SDXL de la VRAM (avant Whisper / autre job lourd)."""
    global _pipeline_flux, _pipeline_sdxl, _active_kind, _ip_adapter_loaded
    for name in ("_pipeline_flux", "_pipeline_sdxl"):
        pipe = globals()[name]
        if pipe is None:
            continue
        try:
            del pipe
        except Exception:
            pass
        globals()[name] = None
    _active_kind = None
    _ip_adapter_loaded = False
    empty_cuda()
    log.info("Pipeline image déchargé")
    log_vram("after image unload")


def _unload_other(keep: Literal["flux", "sdxl"]) -> None:
    """Sur 3060 12GB : un seul pipeline en VRAM à la fois."""
    global _pipeline_flux, _pipeline_sdxl, _active_kind, _ip_adapter_loaded
    if keep == "flux" and _pipeline_sdxl is not None:
        try:
            del _pipeline_sdxl
        except Exception:
            pass
        _pipeline_sdxl = None
        _ip_adapter_loaded = False
        empty_cuda()
        log.info("SDXL déchargé pour libérer VRAM (Flux)")
    elif keep == "sdxl" and _pipeline_flux is not None:
        try:
            del _pipeline_flux
        except Exception:
            pass
        _pipeline_flux = None
        empty_cuda()
        log.info("Flux déchargé pour libérer VRAM (SDXL)")
    _active_kind = keep


def _is_flux(model_id: str) -> bool:
    return "flux" in model_id.lower()


def _cpu_offload_enabled() -> bool:
    return os.getenv("SD_CPU_OFFLOAD", "1").strip() not in (
        "0",
        "false",
        "False",
    )


def _sequential_offload_enabled(*, for_flux: bool) -> bool:
    """Offload couche-par-couche (plus lent, moins VRAM). Défaut auto pour Flux."""
    raw = (os.getenv("SD_SEQUENTIAL_OFFLOAD") or "").strip().lower()
    if raw in ("1", "true", "yes"):
        return True
    if raw in ("0", "false", "no"):
        return False
    return for_flux


def _ref_mode() -> str:
    # Avec ref projet : défaut "style" pour IP-Adapter.
    return os.getenv("SD_REF_MODE", "style").strip().lower() or "style"


def _flux_model_id() -> str:
    return os.getenv("SD_MODEL_ID", DEFAULT_FLUX_MODEL).strip() or DEFAULT_FLUX_MODEL


def _sdxl_model_id() -> str:
    return (
        os.getenv("SD_REF_MODEL_ID", DEFAULT_SDXL_MODEL).strip()
        or DEFAULT_SDXL_MODEL
    )


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


def _apply_device(pipe: Any, device: str, *, for_flux: bool) -> Any:
    if device == "cuda" and not _cpu_offload_enabled():
        log.warning(
            "SD_CPU_OFFLOAD=0 — risque OOM sur RTX 3060 12GB. "
            "Passe SD_CPU_OFFLOAD=1 dans worker/.env"
        )
    if device == "cuda" and _cpu_offload_enabled():
        try:
            if _sequential_offload_enabled(for_flux=for_flux) and hasattr(
                pipe, "enable_sequential_cpu_offload"
            ):
                pipe.enable_sequential_cpu_offload()
                log.info("Diffusers: sequential_cpu_offload")
                _harden_vae(pipe)
                return pipe
            pipe.enable_model_cpu_offload()
            log.info("Diffusers: model_cpu_offload")
            _harden_vae(pipe)
            return pipe
        except Exception as exc:
            log.warning("cpu_offload indisponible (%s) — .to(cuda)", exc)
    pipe = pipe.to(device)
    _harden_vae(pipe)
    return pipe


def _torch_dtype(device: str) -> Any:
    import torch

    if device == "cuda" and torch.cuda.is_bf16_supported():
        return torch.bfloat16
    if device == "cuda":
        return torch.float16
    return torch.float32


def _get_flux_pipeline() -> Any:
    global _pipeline_flux, _active_kind
    if _pipeline_flux is not None:
        _active_kind = "flux"
        return _pipeline_flux

    _unload_other("flux")
    unload_ollama()
    empty_cuda()
    log_vram("before flux load")

    import torch
    from diffusers import FluxPipeline

    model_id = _flux_model_id()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = _torch_dtype(device)
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN") or None

    log.info(
        "Chargement Flux %s sur %s (dtype=%s)…",
        model_id,
        device,
        dtype,
    )
    pipe = FluxPipeline.from_pretrained(
        model_id,
        torch_dtype=dtype,
        token=token,
    )
    pipe = _apply_device(pipe, device, for_flux=True)
    _harden_vae(pipe)
    _pipeline_flux = pipe
    _active_kind = "flux"
    log.info("Pipeline Flux prêt")
    return _pipeline_flux


def _get_sdxl_pipeline() -> Any:
    global _pipeline_sdxl, _active_kind, _ip_adapter_loaded
    if _pipeline_sdxl is not None:
        _active_kind = "sdxl"
        return _pipeline_sdxl

    _unload_other("sdxl")
    unload_ollama()
    empty_cuda()
    log_vram("before sdxl load")

    import torch
    from diffusers import AutoPipelineForText2Image

    model_id = _sdxl_model_id()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = _torch_dtype(device)
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN") or None

    log.info(
        "Chargement SDXL (ref style) %s sur %s (dtype=%s)…",
        model_id,
        device,
        dtype,
    )
    kwargs: dict[str, Any] = {
        "torch_dtype": dtype,
        "token": token,
    }
    if device == "cuda" and dtype == torch.float16:
        kwargs["variant"] = "fp16"
    pipe = AutoPipelineForText2Image.from_pretrained(model_id, **kwargs)
    pipe = _apply_device(pipe, device, for_flux=False)
    _harden_vae(pipe)
    _pipeline_sdxl = pipe
    _active_kind = "sdxl"
    _ip_adapter_loaded = False
    log.info("Pipeline SDXL prêt")
    return _pipeline_sdxl


def _ensure_ip_adapter(pipe: Any) -> bool:
    """Charge IP-Adapter SDXL une fois (style conditioning)."""
    global _ip_adapter_loaded
    if _ip_adapter_loaded:
        return True
    if _active_kind != "sdxl":
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
    seed: int | None = None,
    negative_prompt: str | None = None,
) -> Path:
    if not prompt or not prompt.strip():
        raise ValueError("Prompt d'image vide")

    out = Path(output_path) if output_path else Path("scene.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    unload_ollama()
    empty_cuda()
    log_vram("before image gen")

    width = int(os.getenv("SD_WIDTH", "576"))
    height = int(os.getenv("SD_HEIGHT", "1024"))
    mode = _ref_mode()
    use_ref = bool(style_reference and style_reference.strip()) and mode != "off"

    # Ref présente → SDXL + IP ; sinon Flux Schnell
    use_sdxl = use_ref
    if use_sdxl:
        pipe = _get_sdxl_pipeline()
        steps = int(os.getenv("SD_REF_STEPS", os.getenv("SDXL_STEPS", "25")))
        guidance = float(
            os.getenv("SD_REF_GUIDANCE", os.getenv("SDXL_GUIDANCE", "7.0"))
        )
        ip_scale = float(os.getenv("SD_IP_ADAPTER_SCALE", "0.55"))
    else:
        pipe = _get_flux_pipeline()
        steps = int(os.getenv("SD_STEPS", "4"))
        guidance = float(os.getenv("SD_GUIDANCE", "0"))
        ip_scale = float(os.getenv("SD_IP_ADAPTER_SCALE", "0.45"))

    max_seq = int(os.getenv("SD_MAX_SEQUENCE_LENGTH", "256"))

    import torch

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

    if use_sdxl:
        neg = (negative_prompt or "").strip()
        if neg:
            gen_kwargs["negative_prompt"] = neg
    else:
        gen_kwargs["max_sequence_length"] = max_seq

    seed_val: int | None = seed
    if seed_val is None:
        seed_raw = os.getenv("SD_SEED", "").strip()
        if seed_raw:
            try:
                seed_val = int(seed_raw)
            except ValueError:
                seed_val = None
    if seed_val is not None:
        gen_kwargs["generator"] = torch.Generator(device="cpu").manual_seed(
            int(seed_val)
        )
        log.info("Image seed=%s", seed_val)

    used_ip = False
    if use_ref and use_sdxl and mode in ("style", "ipadapter", "ip-adapter"):
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

    if _ip_adapter_loaded and not used_ip:
        _set_ip_scale(pipe, 0.0)

    log.info(
        "Génération image %s %dx%d steps=%d guidance=%s ip=%s — %s",
        "SDXL" if use_sdxl else "Flux",
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
        empty_cuda()
        log_vram("oom-1")
        if used_ip:
            log.warning("OOM avec IP-Adapter — retry txt2img + prompt style")
            _set_ip_scale(pipe, 0.0)
            gen_kwargs.pop("ip_adapter_image", None)
            try:
                result = pipe(**gen_kwargs)
            except torch.cuda.OutOfMemoryError:
                empty_cuda()
                result = _retry_smaller(pipe, gen_kwargs)
        else:
            result = _retry_smaller(pipe, gen_kwargs)
    finally:
        empty_cuda()

    image = result.images[0]
    image.save(out, format="PNG")
    log.info("Image sauvée → %s (%d bytes)", out, out.stat().st_size)
    return out


def _retry_smaller(pipe: Any, gen_kwargs: dict[str, Any]) -> Any:
    """Dernier recours OOM : résolution plus basse + empty_cache."""
    import torch

    w = int(gen_kwargs.get("width") or 576)
    h = int(gen_kwargs.get("height") or 1024)
    nw = max(384, (w * 3 // 4) // 8 * 8)
    nh = max(640, (h * 3 // 4) // 8 * 8)
    log.warning(
        "OOM — retry %dx%d → %dx%d (active SD_CPU_OFFLOAD=1 si pas déjà)",
        w,
        h,
        nw,
        nh,
    )
    gen_kwargs = {**gen_kwargs, "width": nw, "height": nh}
    empty_cuda()
    log_vram("oom-retry")
    try:
        return pipe(**gen_kwargs)
    except torch.cuda.OutOfMemoryError:
        unload_pipeline()
        empty_cuda()
        raise RuntimeError(
            "CUDA OOM image — mets SD_CPU_OFFLOAD=1, baisse SD_WIDTH/HEIGHT "
            "(ex. 512×896), BROLL_ENABLED=0 si clips, puis restart worker"
        ) from None

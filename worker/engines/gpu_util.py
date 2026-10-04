"""Libération VRAM partagée (Ollama / OmniVoice / ACE-Step / worker)."""
from __future__ import annotations

import gc
import logging
import os
import subprocess

log = logging.getLogger("engines.gpu_util")


def free_vram(reason: str = "", *, unload_llm: bool = True) -> None:
    """Best-effort : Ollama + handlers + empty_cache CUDA."""
    if unload_llm:
        try:
            from engines.ollama_mem import unload_ollama

            unload_ollama(reason or "free_vram")
        except Exception as exc:  # noqa: BLE001
            log.debug("unload_ollama: %s", exc)

    try:
        from engines.acestep_backend import unload_handlers

        unload_handlers()
    except Exception as exc:  # noqa: BLE001
        log.debug("unload acestep: %s", exc)

    try:
        from engines.voice import release_voice_gpu

        release_voice_gpu()
    except Exception as exc:  # noqa: BLE001
        log.debug("release voice: %s", exc)

    # worker/.venv n'a souvent pas torch — tenter quand même + nvidia-smi log
    try:
        import torch

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            free, total = torch.cuda.mem_get_info()
            log.info(
                "VRAM libérée%s — libre %.0f / %.0f MiB",
                f" ({reason})" if reason else "",
                free / (1024 * 1024),
                total / (1024 * 1024),
            )
    except Exception as exc:  # noqa: BLE001
        log.debug("torch free_vram: %s", exc)
        _log_nvidia_smi(reason)

    os.environ.setdefault(
        "PYTORCH_CUDA_ALLOC_CONF",
        "expandable_segments:True",
    )


def _log_nvidia_smi(reason: str) -> None:
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=5,
        ).strip()
        log.info("VRAM nvidia-smi%s — used,free MiB: %s", f" ({reason})" if reason else "", out)
    except Exception as exc:  # noqa: BLE001
        log.debug("nvidia-smi: %s", exc)

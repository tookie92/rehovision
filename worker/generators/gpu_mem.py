"""Helpers VRAM — RTX 3060 12GB : un gros modèle à la fois + empty_cache."""

from __future__ import annotations

import gc
import logging
import os

log = logging.getLogger("rehovision-worker.gpu")


def ensure_alloc_conf() -> None:
    """Réduit la fragmentation CUDA si non déjà défini."""
    key = "PYTORCH_CUDA_ALLOC_CONF"
    if not os.environ.get(key):
        os.environ[key] = "expandable_segments:True"
        log.info("%s=expandable_segments:True", key)


def empty_cuda() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception as exc:
        log.debug("empty_cuda: %s", exc)


def log_vram(tag: str = "") -> None:
    try:
        import torch

        if not torch.cuda.is_available():
            return
        free, total = torch.cuda.mem_get_info()
        log.info(
            "VRAM%s free=%.0fMiB / total=%.0fMiB",
            f" [{tag}]" if tag else "",
            free / (1024 * 1024),
            total / (1024 * 1024),
        )
    except Exception:
        pass

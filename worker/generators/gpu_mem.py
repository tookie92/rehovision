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


def unload_ollama() -> None:
    """
    Décharge Ollama de la VRAM (keep_alive=0).
    Flux ~7Go + qwen2.5:7b ~4.5Go = OOM sur 3060 12GB.
    """
    base = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
    configured = (os.getenv("OLLAMA_MODEL") or "").strip()
    models: list[str] = []
    try:
        import requests

        res = requests.get(f"{base}/api/ps", timeout=5)
        if res.ok:
            for m in res.json().get("models") or []:
                name = (m.get("name") or m.get("model") or "").strip()
                if name:
                    models.append(name)
        if configured and configured not in models:
            models.append(configured)
        if not models and configured:
            models = [configured]

        for name in models:
            try:
                requests.post(
                    f"{base}/api/generate",
                    json={"model": name, "prompt": "", "keep_alive": 0},
                    timeout=30,
                )
                log.info("Ollama unload: %s", name)
            except Exception as exc:
                log.debug("Ollama unload %s: %s", name, exc)
    except Exception as exc:
        log.debug("unload_ollama: %s", exc)

    empty_cuda()
    log_vram("after ollama unload")


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

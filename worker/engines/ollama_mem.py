"""Libère la VRAM Ollama avant un job GPU lourd (OmniVoice / ACE)."""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("engines.ollama_mem")


def unload_ollama(reason: str = "") -> None:
    """Demande à Ollama de décharger les modèles GPU (keep_alive=0)."""
    base = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    try:
        with urllib.request.urlopen(f"{base}/api/ps", timeout=5) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        log.debug("ollama /api/ps: %s", exc)
        body = {}

    models = body.get("models") or []
    names = []
    for m in models:
        name = m.get("model") or m.get("name")
        if name:
            names.append(name)
    if not names:
        # force unload du modèle de traduction par défaut
        names = [os.environ.get("OLLAMA_MODEL", "llama3.2:latest")]

    for name in names:
        payload = {
            "model": name,
            "prompt": "",
            "keep_alive": 0,
            "stream": False,
        }
        req = urllib.request.Request(
            f"{base}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                resp.read()
            log.info(
                "Ollama déchargé: %s%s",
                name,
                f" ({reason})" if reason else "",
            )
        except urllib.error.URLError as exc:
            log.warning("unload_ollama %s: %s", name, exc)

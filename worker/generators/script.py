"""
Génération de script via Ollama (local, gratuit).
Prérequis : `ollama serve` + `ollama pull <OLLAMA_MODEL>`
"""

from __future__ import annotations

import json
import os
from typing import Any

import requests


def generate_script(system_prompt: str, user_prompt: str) -> str:
    """
    Appelle Ollama /api/chat et renvoie le texte JSON brut du script.
    """
    base = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")

    response = requests.post(
        f"{base}/api/chat",
        json={
            "model": model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "options": {
                "temperature": 0.8,
            },
        },
        timeout=300,
    )
    response.raise_for_status()
    data: dict[str, Any] = response.json()
    content = data.get("message", {}).get("content", "")
    if not content:
        raise RuntimeError(f"Réponse Ollama vide: {json.dumps(data)[:500]}")
    return content

"""Traduction locale via Ollama (llama3.2 par défaut)."""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("engines.translate")

LANG_NAMES = {
    "fr": "French",
    "en": "English",
    "es": "Spanish",
    "pt": "Portuguese",
    "de": "German",
    "it": "Italian",
    "ar": "Arabic",
    "sw": "Swahili",
    "ln": "Lingala",
    "yo": "Yoruba",
    "ha": "Hausa",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "hi": "Hindi",
}


def translate(text: str, source_lang: str, target_lang: str) -> str:
    text = text.strip()
    if not text:
        raise ValueError("Texte vide")
    src = source_lang.split("-")[0].lower()
    tgt = target_lang.split("-")[0].lower()
    if src == tgt:
        return text

    base = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "llama3.2:latest")
    src_name = LANG_NAMES.get(src, src)
    tgt_name = LANG_NAMES.get(tgt, tgt)

    prompt = (
        f"Translate the following text from {src_name} to {tgt_name}.\n"
        "Return ONLY the translation, no quotes, no explanation.\n\n"
        f"{text}"
    )
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 2048},
    }
    log.info("Ollama translate %s→%s model=%s (%d chars)", src, tgt, model, len(text))
    req = urllib.request.Request(
        f"{base}/api/generate",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Ollama injoignable ({base}) — lance `ollama serve` / modèle {model}"
        ) from exc

    out = (body.get("response") or "").strip()
    if not out:
        raise RuntimeError("Ollama: traduction vide")
    # Nettoyage léger si le modèle rajoute des guillemets
    if (out.startswith('"') and out.endswith('"')) or (
        out.startswith("'") and out.endswith("'")
    ):
        out = out[1:-1].strip()
    log.info("Traduction OK — %d chars", len(out))
    return out

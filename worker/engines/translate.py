"""Traduction NLLB-200 (subprocess venv OmniVoice) — plus de Llama pour le dub."""
from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path

log = logging.getLogger("engines.translate")

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "nllb_translate.py"

# Miroir de scripts/nllb_translate.py — pour can_auto_translate sans charger HF
FLORES_ISO = frozenset(
    {
        "fr",
        "en",
        "es",
        "pt",
        "de",
        "it",
        "ar",
        "zh",
        "ja",
        "ko",
        "hi",
        "sw",
        "ln",
        "yo",
        "ha",
        "wo",
        "wof",
        "sn",
        "nd",
        "nr",
        "bm",
        "ig",
        "zu",
        "xh",
        "st",
        "tn",
        "ny",
        "rw",
        "so",
        "am",
    }
)


def _norm(code: str) -> str:
    return (code or "").strip().lower().split("-")[0]


def can_auto_translate(source_lang: str, target_lang: str) -> bool:
    src = _norm(source_lang)
    tgt = _norm(target_lang)
    if not src or not tgt:
        return False
    if src == tgt:
        return True
    return src in FLORES_ISO and tgt in FLORES_ISO


def _nllb_python() -> str:
    env = os.environ.get("OMNIVOICE_PYTHON", "").strip()
    if env and Path(env).is_file():
        return env
    marker = ROOT / ".omnivoice_python"
    if marker.is_file():
        p = marker.read_text().strip()
        if p and Path(p).is_file():
            return p
    raise RuntimeError(
        "Python NLLB introuvable (OMNIVOICE_PYTHON / .omnivoice_python). "
        "Voir worker/scripts/setup_omnivoice.sh"
    )


def translate(text: str, source_lang: str, target_lang: str) -> str:
    text = text.strip()
    if not text:
        raise ValueError("Texte vide")
    src = _norm(source_lang)
    tgt = _norm(target_lang)
    if src == tgt:
        return text
    if not can_auto_translate(src, tgt):
        raise RuntimeError(
            f"Traduction NLLB indisponible pour {src}→{tgt} "
            "(langue hors carte FLORES)."
        )

    py = _nllb_python()
    if not SCRIPT.is_file():
        raise RuntimeError(f"Script manquant: {SCRIPT}")

    payload = {
        "text": text,
        "source_lang": src,
        "target_lang": tgt,
        "model": os.environ.get("NLLB_MODEL", "facebook/nllb-200-distilled-600M"),
    }
    log.info("NLLB translate %s→%s via %s (%d chars)", src, tgt, py, len(text))
    proc = subprocess.run(
        [py, str(SCRIPT)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("NLLB_TIMEOUT_S", "300")),
        cwd=str(ROOT),
        env={**os.environ},
        check=False,
    )
    raw_out = (proc.stdout or "").strip()
    # dernière ligne JSON (au cas où HF loggue sur stdout)
    line = raw_out.splitlines()[-1] if raw_out else ""
    try:
        body = json.loads(line) if line else {}
    except json.JSONDecodeError:
        err = (proc.stderr or raw_out or "sortie invalide")[-600:]
        raise RuntimeError(f"NLLB sortie invalide: {err}") from None

    if proc.returncode != 0 or body.get("error"):
        raise RuntimeError(
            str(body.get("error") or proc.stderr or f"NLLB exit {proc.returncode}")[:500]
        )

    spoken = (body.get("spokenText") or "").strip()
    if not spoken:
        raise RuntimeError("NLLB: traduction vide")
    log.info(
        "NLLB OK %s→%s — %d chars: %s",
        src,
        tgt,
        len(spoken),
        spoken[:120].replace("\n", " "),
    )
    return spoken

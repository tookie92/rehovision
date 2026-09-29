"""
Validation média avant Whisper / rendu.

Erreur classique : MP4 tronqué → « moov atom not found » (upload coupé,
téléchargement Convex incomplet, cache YouTube corrompu).
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

log = logging.getLogger("rehovision-worker.media")


def assert_readable_media(path: Path, *, label: str = "source") -> None:
    """
    Lève RuntimeError si le fichier est absent, vide, ou illisible par ffprobe
    (ex. moov atom manquant).
    """
    if not path.is_file():
        raise RuntimeError(f"{label} introuvable: {path}")
    size = path.stat().st_size
    if size == 0:
        raise RuntimeError(f"{label} vide: {path}")
    if size < 1024:
        raise RuntimeError(
            f"{label} trop petit ({size} o) — fichier incomplet ou corrompu"
        )

    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name",
            "-of",
            "default=noprint_wrappers=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    err = (proc.stderr or "").strip()
    if proc.returncode != 0:
        hint = _corrupt_hint(err)
        raise RuntimeError(
            f"{label} illisible ({size // (1024 * 1024)} Mo). {hint}\n"
            f"ffprobe: {err[-500:] or f'exit {proc.returncode}'}"
        )


def _corrupt_hint(stderr: str) -> str:
    low = stderr.lower()
    if "moov" in low or "invalid data" in low:
        return (
            "MP4 incomplet (atome moov manquant) — réuploade le fichier "
            "(l'upload a probablement été coupé) ou vide le cache YouTube "
            "(/tmp/reho-yt-cache) et réessaie."
        )
    return "Fichier corrompu ou format non supporté — réuploade ou réessaie."

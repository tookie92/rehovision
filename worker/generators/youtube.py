"""
Téléchargement YouTube via yt-dlp (comme Opus Clip).

YouTube bloque souvent sans client mobile / runtime JS (EJS).
On privilégie player_client android/ios + fallback web+node/deno.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("rehovision-worker.youtube")


def _yt_dlp_bin() -> str:
    env = os.getenv("YT_DLP_BIN")
    if env and Path(env).is_file():
        return env
    which = shutil.which("yt-dlp")
    if which:
        return which
    local = Path(__file__).resolve().parents[1] / ".venv" / "bin" / "yt-dlp"
    if local.is_file():
        return str(local)
    raise RuntimeError("yt-dlp introuvable — pip install yt-dlp")


def _js_runtime_args() -> list[str]:
    """Ajoute --js-runtimes si deno/node/bun est dispo (challenge YouTube)."""
    candidates: list[tuple[str, str]] = []

    deno = os.getenv("DENO_BIN") or shutil.which("deno")
    if not deno:
        home_deno = Path.home() / ".deno" / "bin" / "deno"
        if home_deno.is_file():
            deno = str(home_deno)
    if deno:
        candidates.append(("deno", deno))

    node = (
        os.getenv("NODE_BIN")
        or shutil.which("node")
        or shutil.which("nodejs")
        or ("/usr/bin/nodejs" if Path("/usr/bin/nodejs").is_file() else None)
    )
    if node:
        candidates.append(("node", node))

    bun = shutil.which("bun")
    if bun:
        candidates.append(("bun", bun))

    args: list[str] = []
    for name, path in candidates:
        args.extend(["--js-runtimes", f"{name}:{path}"])
    return args


def download_youtube(url: str, dest_dir: Path) -> Path:
    """
    Télécharge une vidéo YouTube en mp4 dans dest_dir (≤720p si possible).
    Utilise un cache disque pour éviter de re-télécharger entre Whisper et les rendus.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    cache_root = Path(os.getenv("YT_CACHE_DIR", "/tmp/reho-yt-cache"))
    video_id = _youtube_id(url)
    if video_id:
        cached = cache_root / video_id / "source.mp4"
        if cached.is_file() and cached.stat().st_size > 0:
            log.info("YouTube cache hit %s", video_id)
            final = dest_dir / "source.mp4"
            if cached.resolve() != final.resolve():
                shutil.copy2(cached, final)
            return final

    out_tmpl = str(dest_dir / "source.%(ext)s")
    bin_path = _yt_dlp_bin()

    # android/ios évite beaucoup de 403 / SABR sans JS runtime
    base = [
        bin_path,
        "--no-playlist",
        "--no-progress",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--extractor-args",
        "youtube:player_client=android,ios,tv_embedded,web",
        "-f",
        # 18 = progressive 360p mp4 (fiable). Puis merges ≤720p.
        "18/best[height<=720][ext=mp4]/bv*[height<=720]+ba/best[height<=720]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        out_tmpl,
        *(_js_runtime_args()),
        url,
    ]

    log.info("yt-dlp %s", url)
    proc = subprocess.run(base, capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "")[-1500:]
        raise RuntimeError(f"yt-dlp failed ({proc.returncode}): {err}")

    candidates = sorted(
        [p for p in dest_dir.glob("source.*") if p.is_file() and not p.name.endswith(".part")],
        key=lambda p: p.stat().st_mtime,
    )
    if not candidates:
        raise RuntimeError("yt-dlp n'a produit aucun fichier")

    path = candidates[-1]
    if path.stat().st_size == 0:
        raise RuntimeError("Fichier YouTube vide")

    final = dest_dir / "source.mp4"
    if path.suffix.lower() != ".mp4":
        remux = subprocess.run(
            ["ffmpeg", "-y", "-i", str(path), "-c", "copy", str(final)],
            capture_output=True,
            text=True,
        )
        if remux.returncode != 0 or not final.is_file():
            path.replace(final)
        else:
            path.unlink(missing_ok=True)
    elif path != final:
        path.replace(final)

    if video_id:
        cache_dir = cache_root / video_id
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached = cache_dir / "source.mp4"
        if not cached.is_file():
            shutil.copy2(final, cached)

    log.info("YouTube OK → %s (%.1f Mo)", final.name, final.stat().st_size / 1e6)
    return final


def _youtube_id(url: str) -> str | None:
    from urllib.parse import parse_qs, urlparse

    try:
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.hostname or "").replace("www.", "")
    if host == "youtu.be":
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid or None
    if "youtube" in host:
        qs = parse_qs(parsed.query)
        if "v" in qs and qs["v"]:
            return qs["v"][0]
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
            return parts[1]
    return None

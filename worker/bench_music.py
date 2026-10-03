#!/usr/bin/env python3
"""
Benchmark : 5 ambiances de 30 s, temps + VRAM pic.
Option --upload pour pousser les fichiers dans library via Convex.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env.local")

from engines.music import generate_music, release_gpu  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("bench")

TRACKS = [
    ("Vlog calme", "calme", "calm ambient vlog background music soft acoustic"),
    ("Énergique", "energie", "energetic upbeat electronic music for shorts"),
    ("Voyage", "voyage", "cinematic travel adventure instrumental music"),
    ("Café", "cafe", "chill lo-fi coffee shop jazz hip hop instrumental"),
    ("Motivation", "motivation", "motivational inspiring orchestral pop instrumental"),
]


def vram_peak_mb() -> float | None:
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        return torch.cuda.max_memory_allocated() / (1024 * 1024)
    except Exception:  # noqa: BLE001
        return None


def reset_peak() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass


def upload_to_library(path: Path, title: str, mood: str, prompt: str, duration_s: int) -> None:
    from convex import ConvexClient
    import json
    import urllib.request

    url = os.environ.get("CONVEX_URL") or os.environ.get("CONVEX_SELF_HOSTED_URL")
    token = os.environ.get("WORKER_TOKEN", "")
    if not url or not token:
        raise RuntimeError("CONVEX_URL et WORKER_TOKEN requis pour --upload")

    client = ConvexClient(url)
    from main import _local_upload_url

    upload_url = _local_upload_url(
        client.mutation("worker:generateUploadUrl", {"token": token})
    )
    req = urllib.request.Request(
        upload_url,
        data=path.read_bytes(),
        method="POST",
        headers={"Content-Type": "audio/wav"},
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        storage_id = json.loads(resp.read().decode("utf-8"))["storageId"]
    client.mutation(
        "library:upsertFromWorker",
        {
            "token": token,
            "title": title,
            "mood": mood,
            "durationS": duration_s,
            "storageId": storage_id,
            "prompt": prompt,
        },
    )
    log.info("Bibliothèque ← %s (%s)", title, storage_id)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args()

    print(f"Engine: {os.environ.get('MUSIC_ENGINE', 'fake')}")
    print(f"{'titre':<16} {'temps_s':>8} {'vram_MiB':>10}")
    print("-" * 40)

    for title, mood, prompt in TRACKS:
        reset_peak()
        t0 = time.perf_counter()
        path = generate_music(prompt=prompt, duration_s=args.duration, seed=42)
        elapsed = time.perf_counter() - t0
        vram = vram_peak_mb()
        print(f"{title:<16} {elapsed:8.1f} {vram if vram is not None else float('nan'):10.0f}")
        if args.upload:
            upload_to_library(path, title, mood, prompt, args.duration)
        release_gpu()

    print("OK")


if __name__ == "__main__":
    main()

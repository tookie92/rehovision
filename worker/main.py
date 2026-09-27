#!/usr/bin/env python3
"""
Worker local Rehovision — poll Convex, génère via Ollama / stubs GPU, renvoie les résultats.

Usage:
  cd worker
  cp .env.example .env   # renseigner CONVEX_SITE_URL + WORKER_SECRET_KEY
  pip install -r requirements.txt
  ollama pull llama3.2   # ou le modèle choisi dans OLLAMA_MODEL
  python main.py
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from generators.image import generate_image
from generators.script import generate_script
from generators.video import assemble_video
from generators.voiceover import generate_voiceover

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("rehovision-worker")


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if not value:
        raise RuntimeError(f"Variable d'environnement manquante: {name}")
    return value


def _headers() -> dict[str, str]:
    return {"x-worker-secret": _env("WORKER_SECRET_KEY")}


def get_next_job(site_url: str) -> dict[str, Any] | None:
    res = requests.get(
        f"{site_url}/worker/getNextJob",
        headers=_headers(),
        timeout=60,
    )
    res.raise_for_status()
    data = res.json()
    return data.get("job")


def submit_file_result(
    site_url: str,
    job_id: str,
    file_path: Path,
    content_type: str,
    duration_seconds: float | None = None,
) -> None:
    params: dict[str, str] = {"jobId": job_id}
    if duration_seconds is not None:
        # Arrondi stable pour la query string
        params["durationSeconds"] = f"{float(duration_seconds):.3f}"

    payload = file_path.read_bytes()
    if not payload:
        raise RuntimeError(f"Fichier vide: {file_path}")

    res = requests.post(
        f"{site_url}/worker/submitJobResult",
        params=params,
        headers={
            **_headers(),
            "Content-Type": content_type or "application/octet-stream",
        },
        data=payload,
        timeout=300,
    )
    if not res.ok:
        log.error(
            "submitJobResult %s: %s %s",
            res.status_code,
            res.reason,
            res.text[:800],
        )
    res.raise_for_status()


def submit_script_result(
    site_url: str,
    job_id: str,
    *,
    raw_script: str | None = None,
    error: str | None = None,
) -> None:
    body: dict[str, str] = {}
    if error:
        body["error"] = error
    elif raw_script is not None:
        body["rawScript"] = raw_script
    else:
        raise ValueError("raw_script ou error requis")

    res = requests.post(
        f"{site_url}/worker/submitScriptResult",
        params={"jobId": job_id},
        headers={**_headers(), "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    res.raise_for_status()


def submit_job_error(site_url: str, job_id: str, error: str, job_type: str) -> None:
    if job_type == "script":
        submit_script_result(site_url, job_id, error=error)
        return

    res = requests.post(
        f"{site_url}/worker/submitJobResult",
        params={"jobId": job_id, "error": error},
        headers=_headers(),
        timeout=60,
    )
    res.raise_for_status()


def process_job(site_url: str, job: dict[str, Any]) -> None:
    job_id = job["_id"]
    job_type = job["type"]
    payload = job.get("payload") or {}
    log.info("Traitement job %s (%s)", job_id, job_type)

    work_dir = Path(tempfile.mkdtemp(prefix=f"reho-{job_type}-"))

    try:
        if job_type == "script":
            raw = generate_script(
                system_prompt=payload["systemPrompt"],
                user_prompt=payload["userPrompt"],
            )
            submit_script_result(site_url, job_id, raw_script=raw)
            log.info("Script soumis pour job %s", job_id)
            return

        if job_type == "image":
            out = work_dir / "scene.png"
            path = generate_image(
                prompt=payload.get("prompt", ""),
                style_reference=payload.get("referenceImageUrl"),
                output_path=out,
            )
            submit_file_result(site_url, job_id, path, "image/png")
            return

        if job_type == "voiceover":
            out = work_dir / "scene.wav"
            path, duration = generate_voiceover(
                text=payload.get("text", ""),
                tone=payload.get("tone", ""),
                output_path=out,
            )
            submit_file_result(
                site_url,
                job_id,
                path,
                "audio/wav",
                duration_seconds=duration,
            )
            return

        if job_type == "video_assembly":
            ctx = job.get("assemblyContext") or {}
            out = work_dir / "final.mp4"
            path = assemble_video(
                scenes=ctx.get("scenes") or [],
                title=ctx.get("title") or "",
                output_path=out,
            )
            submit_file_result(site_url, job_id, path, "video/mp4")
            return

        raise ValueError(f"Type de job inconnu: {job_type}")

    except NotImplementedError as e:
        log.warning("Stub non branché: %s", e)
        submit_job_error(site_url, job_id, str(e), job_type)
    except Exception as e:
        log.exception("Échec job %s", job_id)
        try:
            submit_job_error(site_url, job_id, str(e), job_type)
        except Exception:
            log.exception("Impossible de signaler l'échec du job %s", job_id)


def main() -> None:
    site_url = _env("CONVEX_SITE_URL").rstrip("/")
    _env("WORKER_SECRET_KEY")  # valide tôt
    interval = float(os.getenv("POLL_INTERVAL_SECONDS", "3"))

    log.info("Worker démarré — poll %ss sur %s", interval, site_url)
    log.info(
        "Ollama: %s model=%s",
        os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        os.getenv("OLLAMA_MODEL", "llama3.2"),
    )
    log.info(
        "SD: %s %sx%s steps=%s | Piper: %s",
        os.getenv("SD_MODEL_ID", "stabilityai/sdxl-turbo"),
        os.getenv("SD_WIDTH", "576"),
        os.getenv("SD_HEIGHT", "1024"),
        os.getenv("SD_STEPS", "4"),
        os.getenv("PIPER_MODEL_PATH", "(non configuré)"),
    )

    while True:
        try:
            job = get_next_job(site_url)
            if job:
                process_job(site_url, job)
            else:
                time.sleep(interval)
        except KeyboardInterrupt:
            log.info("Arrêt demandé")
            sys.exit(0)
        except Exception:
            log.exception("Erreur de boucle — retry")
            time.sleep(interval)


if __name__ == "__main__":
    main()

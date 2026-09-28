#!/usr/bin/env python3
"""
Worker local Rehovision — poll Convex, génère via Ollama / Whisper / ffmpeg.

Usage:
  cd worker
  cp .env.example .env
  pip install -r requirements.txt
  python main.py
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from generators.image import generate_image
from generators.propose_clips import propose_clips
from generators.render_clip import render_clip
from generators.script import generate_script
from generators.transcribe import download_source, transcribe_video
from generators.video import assemble_video
from generators.voiceover import generate_voiceover
from generators.youtube import download_youtube

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("rehovision-worker")

CLIP_JSON_TYPES = {"transcribe", "propose_clips"}


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


def submit_clip_pipeline_result(
    site_url: str,
    job_id: str,
    *,
    transcript: dict[str, Any] | None = None,
    clips: list[dict[str, Any]] | None = None,
    error: str | None = None,
) -> None:
    body: dict[str, Any] = {}
    if error:
        body["error"] = error
    if transcript is not None:
        body["transcript"] = transcript
    if clips is not None:
        body["clips"] = clips

    res = requests.post(
        f"{site_url}/worker/submitClipPipelineResult",
        params={"jobId": job_id},
        headers={**_headers(), "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    if not res.ok:
        log.error(
            "submitClipPipelineResult %s: %s",
            res.status_code,
            res.text[:800],
        )
    res.raise_for_status()


def submit_source_video(site_url: str, job_id: str, file_path: Path) -> str:
    """
    DEPRECATED pour YouTube (OOM httpAction 64MB).
    Conservé pour petits fichiers si besoin.
    """
    size_mb = file_path.stat().st_size / 1e6
    if size_mb > 20:
        raise RuntimeError(
            f"Fichier trop gros pour submitSourceVideo ({size_mb:.0f} Mo). "
            "Utiliser le flux YouTube local (cache) sans upload Convex."
        )
    payload = file_path.read_bytes()
    if not payload:
        raise RuntimeError(f"Fichier vide: {file_path}")
    res = requests.post(
        f"{site_url}/worker/submitSourceVideo",
        params={"jobId": job_id},
        headers={
            **_headers(),
            "Content-Type": "video/mp4",
        },
        data=payload,
        timeout=600,
    )
    if not res.ok:
        log.error("submitSourceVideo %s: %s", res.status_code, res.text[:800])
    res.raise_for_status()
    data = res.json()
    url = data.get("resultUrl")
    if not url:
        raise RuntimeError("submitSourceVideo sans resultUrl")
    return url


def resolve_media_source(
    work_dir: Path,
    *,
    youtube_url: str | None = None,
    source_url: str | None = None,
) -> Path:
    """Résout une source locale : YouTube (cache) ou URL Convex storage."""
    src = work_dir / "source.mp4"
    if youtube_url:
        downloaded = download_youtube(youtube_url, work_dir)
        if downloaded != src:
            shutil.copy2(downloaded, src)
        return src
    if source_url:
        download_source(source_url, src)
        return src
    raise RuntimeError("sourceVideoUrl ou youtubeUrl requis")


def submit_job_error(site_url: str, job_id: str, error: str, job_type: str) -> None:
    if job_type == "script":
        submit_script_result(site_url, job_id, error=error)
        return
    if job_type in CLIP_JSON_TYPES:
        submit_clip_pipeline_result(site_url, job_id, error=error)
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

        if job_type == "transcribe":
            youtube_url = payload.get("youtubeUrl")
            source_url = payload.get("sourceVideoUrl")
            # YouTube : rester local (pas d'upload Convex — OOM httpAction 64MB)
            src = resolve_media_source(
                work_dir,
                youtube_url=youtube_url,
                source_url=source_url,
            )
            lang = payload.get("language") or "auto"
            transcript = transcribe_video(src, language=lang)
            submit_clip_pipeline_result(
                site_url, job_id, transcript=transcript
            )
            log.info(
                "Transcript %s segments langue=%s",
                len(transcript.get("segments") or []),
                transcript.get("language"),
            )
            return

        if job_type == "propose_clips":
            transcript = payload.get("transcript") or {}
            clips = propose_clips(transcript)
            submit_clip_pipeline_result(site_url, job_id, clips=clips)
            log.info("%s clips proposés", len(clips))
            return

        if job_type == "render_clip":
            youtube_url = payload.get("youtubeUrl")
            source_url = payload.get("sourceVideoUrl")
            src = resolve_media_source(
                work_dir,
                youtube_url=youtube_url,
                source_url=source_url,
            )
            out = work_dir / "clip.mp4"
            path = render_clip(
                src,
                out,
                start_sec=float(payload.get("startSec", 0)),
                end_sec=float(payload.get("endSec", 30)),
                caption_text=payload.get("captionText") or "",
                caption_segments=payload.get("captionSegments") or None,
                broll_cues=payload.get("brollCues") or payload.get("broll") or None,
                caption_style=payload.get("captionStyle") or None,
                layout_mode=payload.get("layoutMode") or None,
                voiceover_mode=payload.get("voiceoverMode") or None,
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
    _env("WORKER_SECRET_KEY")
    interval = float(os.getenv("POLL_INTERVAL_SECONDS", "3"))

    log.info("Worker démarré — poll %ss sur %s", interval, site_url)
    log.info(
        "Ollama: %s model=%s | Whisper: %s",
        os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        os.getenv("OLLAMA_MODEL", "llama3.2"),
        os.getenv("WHISPER_MODEL", "base"),
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

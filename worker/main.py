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

from generators.image import generate_image, unload_pipeline as unload_image_pipeline
from generators.propose_clips import propose_clips
from generators.render_clip import render_clip
from generators.script import generate_script
from generators.stitch_clips import stitch_clips
from generators.transcribe import download_source, transcribe_video, unload_whisper
from generators.video import assemble_video
from generators.voiceover import generate_voiceover, unload_omnivoice
from generators.youtube import download_youtube
from generators.gpu_mem import empty_cuda, ensure_alloc_conf, log_vram, unload_ollama
from upload_server import (
    resolve_local_file,
    start_upload_server,
    store_result_file,
    store_source_file,
)

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
    """
    Toujours : disque worker + JSON { resultUrl }.
    Jamais de body binaire vers Convex (OOM 64 Mo / 413 Payload Too Large).
    """
    if not file_path.is_file() or file_path.stat().st_size == 0:
        raise RuntimeError(f"Fichier vide: {file_path}")

    ctype = (content_type or "").lower()
    if file_path.suffix:
        ext = file_path.suffix
    elif "png" in ctype:
        ext = ".png"
    elif "jpeg" in ctype or "jpg" in ctype:
        ext = ".jpg"
    elif "wav" in ctype:
        ext = ".wav"
    elif "video" in ctype:
        ext = ".mp4"
    else:
        ext = ".bin"

    media_url = store_result_file(file_path, preferred_ext=ext)
    body: dict[str, Any] = {"resultUrl": media_url}
    if duration_seconds is not None:
        body["durationSeconds"] = round(float(duration_seconds), 3)

    log.info(
        "submitJobResult via URL (%.1f Mo) → %s",
        file_path.stat().st_size / 1e6,
        media_url,
    )
    res = requests.post(
        f"{site_url}/worker/submitJobResult",
        params={"jobId": job_id},
        headers={**_headers(), "Content-Type": "application/json"},
        json=body,
        timeout=120,
    )
    if not res.ok:
        log.error(
            "submitJobResult(url) %s: %s %s",
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
            "Utiliser submit_source_media_url (disque worker /media/)."
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


def submit_source_media_url(
    site_url: str, job_id: str, media_url: str, local_file_id: str
) -> None:
    """Enregistre /media/{id} sur le projet clip (soft preview navigateur)."""
    res = requests.post(
        f"{site_url}/worker/submitSourceMediaUrl",
        params={"jobId": job_id},
        headers={**_headers(), "Content-Type": "application/json"},
        json={"mediaUrl": media_url, "localFileId": local_file_id},
        timeout=60,
    )
    if not res.ok:
        log.error(
            "submitSourceMediaUrl %s: %s",
            res.status_code,
            res.text[:800],
        )
    res.raise_for_status()


def needs_yt_source_persist(payload: dict[str, Any]) -> bool:
    """True si YouTube sans source déjà dispo en /media/ (soft preview)."""
    youtube_url = payload.get("youtubeUrl")
    if not youtube_url:
        return False
    if payload.get("localFileId"):
        return False
    source_url = str(payload.get("sourceVideoUrl") or "")
    if "/media/" in source_url:
        return False
    return True


def persist_source_for_soft_preview(
    site_url: str,
    job_id: str,
    src: Path,
    *,
    stable_key: str,
) -> tuple[str, str]:
    """Copie source sur disque worker + notifie Convex (JSON, pas blob)."""
    media_url, file_id = store_source_file(
        src,
        stable_key=stable_key,
        preferred_ext=src.suffix or ".mp4",
    )
    submit_source_media_url(site_url, job_id, media_url, file_id)
    log.info("Source soft preview → %s", media_url)
    return media_url, file_id


def resolve_media_source(
    work_dir: Path,
    *,
    youtube_url: str | None = None,
    source_url: str | None = None,
    local_file_id: str | None = None,
) -> Path:
    """Résout une source : fichier local worker, YouTube, ou URL (Convex)."""
    from generators.media_validate import assert_readable_media

    src = work_dir / "source.mp4"

    if local_file_id:
        local = resolve_local_file(str(local_file_id))
        if not local:
            raise RuntimeError(f"Fichier local introuvable: {local_file_id}")
        if local != src:
            shutil.copy2(local, src)
        assert_readable_media(src, label="fichier local")
        return src

    # mediaUrl worker → fileId
    if source_url and "/media/" in source_url:
        file_id = source_url.rstrip("/").rsplit("/media/", 1)[-1].split("?")[0]
        local = resolve_local_file(file_id)
        if local:
            if local != src:
                shutil.copy2(local, src)
            assert_readable_media(src, label="média local")
            return src

    if youtube_url:
        downloaded = download_youtube(youtube_url, work_dir)
        if downloaded != src:
            shutil.copy2(downloaded, src)
        assert_readable_media(src, label="YouTube")
        return src
    if source_url:
        download_source(source_url, src)
        return src
    raise RuntimeError("sourceVideoUrl, localFileId ou youtubeUrl requis")


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

    # Un modèle GPU à la fois (Whisper ↔ Flux/SDXL ↔ OmniVoice ↔ Ollama)
    if job_type in ("image", "render_clip", "voiceover"):
        unload_whisper()
    if job_type in ("image",):
        unload_ollama()
        unload_omnivoice()
    if job_type in ("voiceover", "transcribe", "render_clip"):
        unload_image_pipeline()
    if job_type in ("transcribe", "render_clip"):
        unload_omnivoice()
    empty_cuda()
    log_vram(f"before {job_type}")

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
            raw_speed = payload.get("speed")
            try:
                speed_val = float(raw_speed) if raw_speed is not None else None
            except (TypeError, ValueError):
                speed_val = None
            path, duration = generate_voiceover(
                text=payload.get("text", ""),
                tone=payload.get("tone", ""),
                voice_instruct=payload.get("voiceInstruct") or "",
                speed=speed_val,
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
            local_file_id = payload.get("localFileId")
            src = resolve_media_source(
                work_dir,
                youtube_url=youtube_url,
                source_url=source_url,
                local_file_id=local_file_id,
            )
            # Soft preview navigateur : YouTube → /media/{id} (comme upload fichier)
            if needs_yt_source_persist(payload):
                persist_source_for_soft_preview(
                    site_url,
                    job_id,
                    src,
                    stable_key=str(youtube_url),
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
            local_file_id = payload.get("localFileId")
            src = resolve_media_source(
                work_dir,
                youtube_url=youtube_url,
                source_url=source_url,
                local_file_id=local_file_id,
            )
            # Soft preview backfill (fileId stable) : anciens projets YT
            if needs_yt_source_persist(payload) and youtube_url:
                try:
                    persist_source_for_soft_preview(
                        site_url,
                        job_id,
                        src,
                        stable_key=str(youtube_url),
                    )
                except Exception as e:
                    log.warning("persist source soft preview: %s", e)
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
                split_swap=bool(payload.get("splitSwap")),
                split_focus_top=payload.get("splitFocusTop") or None,
                split_focus_bot=payload.get("splitFocusBot") or None,
                smart_focus=payload.get("smartFocus") or None,
                voiceover_mode=payload.get("voiceoverMode") or None,
                audio_enhance=payload.get("audioEnhance") or None,
                punch_effect=payload.get("punchEffect") or None,
                look_filter=payload.get("lookFilter") or None,
                lut_url=payload.get("lutUrl") or None,
                logo_url=payload.get("logoUrl") or None,
                logo_corner=payload.get("logoCorner") or None,
                logo_opacity=(
                    float(payload["logoOpacity"])
                    if payload.get("logoOpacity") is not None
                    else None
                ),
                music_url=payload.get("musicUrl") or None,
                music_volume=(
                    float(payload["musicVolume"])
                    if payload.get("musicVolume") is not None
                    else None
                ),
            )
            submit_file_result(site_url, job_id, path, "video/mp4")
            return

        if job_type == "stitch_clips":
            clip_urls = payload.get("clipUrls") or []
            if not isinstance(clip_urls, list) or len(clip_urls) < 2:
                raise ValueError("stitch_clips: clipUrls (2–3) requis")
            out = work_dir / "stitched.mp4"
            path, duration = stitch_clips(
                [str(u) for u in clip_urls],
                out,
                work_dir=work_dir,
                resolve_local_file=resolve_local_file,
            )
            submit_file_result(
                site_url,
                job_id,
                path,
                "video/mp4",
                duration_seconds=duration,
            )
            log.info(
                "Stitch %s clips → %.1fs",
                len(clip_urls),
                duration,
            )
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
    finally:
        empty_cuda()
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


def main() -> None:
    ensure_alloc_conf()
    site_url = _env("CONVEX_SITE_URL").rstrip("/")
    _env("WORKER_SECRET_KEY")
    interval = float(os.getenv("POLL_INTERVAL_SECONDS", "3"))

    start_upload_server()

    log.info("Worker démarré — poll %ss sur %s", interval, site_url)
    log.info(
        "Ollama: %s model=%s | Whisper: %s | SD_CPU_OFFLOAD=%s",
        os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        os.getenv("OLLAMA_MODEL", "llama3.2"),
        os.getenv("WHISPER_MODEL", "base"),
        os.getenv("SD_CPU_OFFLOAD", "1"),
    )
    log_vram("startup")

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

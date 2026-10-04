#!/usr/bin/env python3
"""
Worker GPU — un job à la fois.
Boucle : reclaim → claimNextJob → generate → upload → complete/fail.
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env.local")

from convex import ConvexClient  # noqa: E402

from engines.clips import run_clips_stub  # noqa: E402
from engines.dub import run_dub  # noqa: E402
from engines.edit import render_edit  # noqa: E402
from engines.gpu_util import free_vram  # noqa: E402
from engines.music import generate_music, release_gpu  # noqa: E402
from engines.suggest import apply_suggestion  # noqa: E402
from engines.translate_server import start_translate_server  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("worker")

STOP = False


def _handle_stop(signum: int, _frame: object) -> None:
    global STOP
    log.info("Signal %s reçu — arrêt après le job courant", signum)
    STOP = True


def _vram_mb() -> float | None:
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        return torch.cuda.max_memory_allocated() / (1024 * 1024)
    except Exception:  # noqa: BLE001
        return None


def _reset_vram_peak() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:  # noqa: BLE001
        pass


def _local_upload_url(upload_url: str) -> str:
    """Réécrit l'URL d'upload vers le backend local.

    CONVEX_CLOUD_ORIGIN est public (tunnel) pour que le navigateur lise les
    fichiers, mais Cloudflare bloque souvent les POST urllib (CF 1010 / 403).
    Le worker doit donc uploader sur 127.0.0.1.
    """
    from urllib.parse import urlparse, urlunparse

    local = os.environ.get("CONVEX_URL") or os.environ.get("CONVEX_SELF_HOSTED_URL")
    if not local:
        return upload_url
    pub = urlparse(upload_url)
    loc = urlparse(local)
    return urlunparse(
        (loc.scheme, loc.netloc, pub.path, pub.params, pub.query, pub.fragment)
    )


def upload_file(client: ConvexClient, token: str, path: Path) -> str:
    upload_url = _local_upload_url(
        client.mutation("worker:generateUploadUrl", {"token": token})
    )
    log.info("Upload → %s", upload_url.split("?", 1)[0])
    data = path.read_bytes()
    suffix = path.suffix.lower()
    ctype = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
    }.get(suffix, "application/octet-stream")
    import json
    import urllib.request

    req = urllib.request.Request(
        upload_url,
        data=data,
        method="POST",
        headers={"Content-Type": ctype},
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    storage_id = body.get("storageId")
    if not storage_id:
        raise RuntimeError(f"Upload sans storageId: {body}")
    return storage_id


def download_storage_file(client: ConvexClient, storage_id: str) -> Path:
    """Télécharge un fichier Convex storage vers outputs/ (URL locale)."""
    import urllib.request

    url = client.query("jobs:getFileUrl", {"storageId": storage_id})
    if not url:
        raise RuntimeError(f"URL introuvable pour {storage_id}")
    local_url = _local_upload_url(url)
    dest_dir = ROOT / "outputs" / "inputs"
    dest_dir.mkdir(parents=True, exist_ok=True)
    # extension approximative depuis le path URL
    suffix = Path(url.split("?", 1)[0]).suffix or ".bin"
    if len(suffix) > 8:
        suffix = ".bin"
    dest = dest_dir / f"{storage_id.replace(':', '_')}{suffix}"
    log.info("Download source → %s", local_url.split("?", 1)[0])
    urllib.request.urlretrieve(local_url, dest)
    if dest.stat().st_size < 32:
        raise RuntimeError("Fichier source vide / trop petit")
    return dest


def process_job(client: ConvexClient, token: str, job: dict) -> None:
    job_id = job["_id"]
    job_type = job.get("type")
    params = job.get("params") or {}

    def set_progress(p: int, _msg: str = "") -> None:
        client.mutation(
            "worker:updateProgress",
            {"token": token, "jobId": job_id, "progress": p},
        )

    set_progress(10)
    _reset_vram_peak()
    free_vram(f"début {job_type}")
    t0 = time.perf_counter()
    result_meta: dict | None = None
    try:
        if job_type == "music":
            prompt = str(params.get("prompt") or "ambient music")
            duration_s = int(params.get("durationS") or params.get("duration_s") or 30)
            seed = params.get("seed")
            if seed is not None:
                seed = int(seed)
            instrumental = bool(params.get("instrumental", True))
            lyrics = str(params.get("lyrics") or "").strip() or None
            bpm = params.get("bpm")
            if bpm is not None and bpm != "":
                try:
                    bpm = int(bpm)
                except (TypeError, ValueError):
                    bpm = None
            else:
                bpm = None
            keyscale = str(params.get("keyscale") or "").strip() or None
            timesignature = params.get("timesignature")
            if timesignature is not None and timesignature != "":
                timesignature = str(timesignature).strip()
            else:
                timesignature = None
            steps = params.get("inferenceSteps") or params.get("inference_steps")
            if steps is not None:
                steps = int(steps)
            log.info(
                "Job %s music — prompt=%r %ss instr=%s lyrics_len=%d bpm=%s",
                job_id,
                prompt[:60],
                duration_s,
                instrumental,
                len(lyrics or ""),
                bpm,
            )
            audio_path = generate_music(
                prompt=prompt,
                duration_s=duration_s,
                seed=seed,
                lyrics=lyrics,
                instrumental=instrumental,
                bpm=bpm,
                keyscale=keyscale,
                timesignature=timesignature,
                inference_steps=steps,
            )
            result_meta = {
                "prompt": prompt[:500],
                "durationS": duration_s,
                "instrumental": instrumental,
                "bpm": bpm,
                "seed": seed,
                "keyscale": keyscale,
            }
        elif job_type in ("dub", "narration"):
            if not params.get("voiceConsent"):
                raise RuntimeError("Consentement voix manquant (voiceConsent)")
            text = str(params.get("text") or "").strip() or None
            source_lang = str(params.get("sourceLang") or "fr")
            target_lang = str(params.get("targetLang") or "fr")
            source_storage = params.get("sourceStorageId")
            source_path: Path | None = None
            if source_storage:
                source_path = download_storage_file(client, str(source_storage))
            if not text and source_path is None:
                raise RuntimeError("Texte ou audio source requis")
            voice_mode = str(params.get("voiceMode") or "").strip().lower()
            if voice_mode in ("keep", "clone", "garder"):
                clone_voice = True
            elif voice_mode in ("model", "auto", "modele", "modèle"):
                clone_voice = False
            else:
                clone_voice = bool(params.get("cloneVoice", True))
            log.info(
                "Job %s %s — %s→%s text=%s audio=%s clone=%s",
                job_id,
                job_type,
                source_lang,
                target_lang,
                bool(text),
                bool(source_path),
                clone_voice,
            )
            instruct = params.get("instruct")
            target_text = str(params.get("targetText") or "").strip() or None
            auto_tr = params.get("autoTranslate")
            if auto_tr is not None:
                auto_tr = bool(auto_tr)
            ref_storage = params.get("refStorageId") or params.get("voiceRefStorageId")
            ref_path: Path | None = None
            if ref_storage:
                ref_path = download_storage_file(client, str(ref_storage))
            dub = run_dub(
                text=text,
                audio_path=source_path,
                source_lang=source_lang,
                target_lang=target_lang,
                target_text=target_text,
                auto_translate=auto_tr,
                instruct=str(instruct) if instruct else None,
                clone_voice=clone_voice,
                ref_audio_path=ref_path,
                on_progress=set_progress,
            )
            audio_path = dub.path
            result_meta = {
                "sourceText": dub.source_text[:2000],
                "spokenText": dub.spoken_text[:2000],
                "translated": dub.translated,
                "clone": dub.clone,
                "sourceLang": dub.source_lang,
                "targetLang": dub.target_lang,
                "voiceMode": "keep" if dub.clone else "model",
            }
        elif job_type == "clips":
            source_storage = params.get("sourceStorageId")
            if not source_storage:
                raise RuntimeError("Vidéo source requise (sourceStorageId)")
            hook_s = int(params.get("hookDurationS") or params.get("durationS") or 15)
            source_path = download_storage_file(client, str(source_storage))
            if source_path.suffix.lower() in ("", ".bin"):
                renamed = source_path.with_suffix(".mp4")
                source_path.rename(renamed)
                source_path = renamed
            log.info("Job %s clips — hook=%ss source=%s", job_id, hook_s, source_path.name)
            audio_path, proposals, suggestions = run_clips_stub(
                source_path=source_path,
                hook_duration_s=hook_s,
                on_progress=set_progress,
            )
            result_meta = {
                "layer": 4,
                "proposals": proposals,
                "suggestions": suggestions,
                "engine": "silence+energy-heuristic",
            }
        elif job_type == "clip_edit":
            source_storage = params.get("sourceStorageId")
            if not source_storage:
                raise RuntimeError("sourceStorageId requis pour clip_edit")
            segments = params.get("segments") or []
            if not isinstance(segments, list) or not segments:
                raise RuntimeError("segments requis")
            source_path = download_storage_file(client, str(source_storage))
            if source_path.suffix.lower() in ("", ".bin"):
                renamed = source_path.with_suffix(".mp4")
                source_path.rename(renamed)
                source_path = renamed
            log.info("Job %s clip_edit — %d segments", job_id, len(segments))
            audio_path = render_edit(
                source_path=source_path,
                segments=segments,
                on_progress=set_progress,
            )
            result_meta = {
                "layer": 3,
                "appliedSegments": segments,
                "parentJobId": params.get("parentJobId"),
            }
        elif job_type == "clip_suggest":
            source_storage = params.get("sourceStorageId")
            suggestion = params.get("suggestion")
            if not source_storage or not isinstance(suggestion, dict):
                raise RuntimeError("sourceStorageId + suggestion requis")
            source_path = download_storage_file(client, str(source_storage))
            if source_path.suffix.lower() in ("", ".bin"):
                renamed = source_path.with_suffix(".mp4")
                source_path.rename(renamed)
                source_path = renamed
            log.info(
                "Job %s clip_suggest — %s",
                job_id,
                suggestion.get("kind"),
            )
            audio_path = apply_suggestion(
                source_path=source_path,
                suggestion=suggestion,
                base_segments=params.get("baseSegments"),
                on_progress=set_progress,
            )
            result_meta = {
                "layer": 4,
                "appliedSuggestion": suggestion,
                "parentJobId": params.get("parentJobId"),
            }
        else:
            raise RuntimeError(f"Type non supporté: {job_type}")

        set_progress(80)
        storage_id = upload_file(client, token, audio_path)
        complete_args: dict = {
            "token": token,
            "jobId": job_id,
            "resultStorageId": storage_id,
        }
        if result_meta is not None:
            complete_args["resultMeta"] = result_meta
        client.mutation("worker:completeJob", complete_args)
        elapsed = time.perf_counter() - t0
        vram = _vram_mb()
        log.info(
            "Job %s terminé en %.1fs — VRAM pic=%s",
            job_id,
            elapsed,
            f"{vram:.0f} MiB" if vram is not None else "n/a",
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Job %s échoué", job_id)
        client.mutation(
            "worker:failJob",
            {"token": token, "jobId": job_id, "error": str(exc)[:500]},
        )
    finally:
        release_gpu()


def main() -> None:
    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    url = os.environ.get("CONVEX_URL") or os.environ.get("CONVEX_SELF_HOSTED_URL")
    token = os.environ.get("WORKER_TOKEN", "")
    stale = int(os.environ.get("WORKER_STALE_MINUTES", "15"))

    if not url:
        log.error("CONVEX_URL manquant")
        sys.exit(1)
    if not token:
        log.error("WORKER_TOKEN manquant")
        sys.exit(1)

    client = ConvexClient(url)
    log.info("Worker démarré — %s — engine=%s", url, os.environ.get("MUSIC_ENGINE", "fake"))
    try:
        start_translate_server()
    except Exception as exc:  # noqa: BLE001
        log.warning("Serveur NLLB translate non démarré: %s", exc)

    result = client.mutation(
        "worker:reclaimStaleJobs",
        {"token": token, "staleMinutes": stale},
    )
    log.info("Reclaim: %s", result)

    while not STOP:
        job = client.mutation("worker:claimNextJob", {"token": token})
        if job is None:
            time.sleep(2)
            continue
        if job.get("type") not in (
            "music",
            "dub",
            "narration",
            "clips",
            "clip_edit",
            "clip_suggest",
        ):
            client.mutation(
                "worker:failJob",
                {
                    "token": token,
                    "jobId": job["_id"],
                    "error": f"Type non supporté: {job.get('type')}",
                },
            )
            continue
        process_job(client, token, job)

    log.info("Worker arrêté proprement")


if __name__ == "__main__":
    main()

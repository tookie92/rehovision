"""
AI B-roll pour clips : prompts visuels + stills Flux + overlay ffmpeg.
Désactivable via BROLL_ENABLED=0.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger("rehovision-worker.broll")

BROLL_SYSTEM = """Tu proposes du B-roll visuel pour un short vertical.
Réponds UNIQUEMENT en JSON:
{
  "broll": [
    {
      "relStartSec": 4.0,
      "durationSec": 1.8,
      "prompt": "English visual prompt, cinematic photo, vertical 9:16, no text, no watermark"
    }
  ]
}
Règles:
- 1 ou 2 plans max
- relStartSec >= 2 et relStartSec+durationSec < clipDuration-1
- durationSec entre 1.2 et 2.5
- prompt en anglais, concret, sans visage de célébrité, sans texte dans l'image
"""


def broll_enabled() -> bool:
    return os.getenv("BROLL_ENABLED", "1").strip() not in ("0", "false", "False")


def _max_shots() -> int:
    return max(0, min(3, int(os.getenv("BROLL_MAX", "2"))))


def _default_duration() -> float:
    return float(os.getenv("BROLL_DURATION", "1.8"))


def _ollama_broll(caption: str, clip_duration: float) -> list[dict[str, Any]]:
    base = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    user = (
        f"clipDuration={clip_duration:.1f}s\n"
        f"maxShots={_max_shots()}\n"
        f"caption/transcript excerpt:\n{caption[:1200]}"
    )
    response = requests.post(
        f"{base}/api/chat",
        json={
            "model": model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": BROLL_SYSTEM},
                {"role": "user", "content": user},
            ],
            "options": {"temperature": 0.5},
        },
        timeout=120,
    )
    response.raise_for_status()
    content = response.json().get("message", {}).get("content", "")
    data = json.loads(content)
    return list(data.get("broll") or [])


def _heuristic_broll(
    caption: str,
    clip_duration: float,
    segments: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Place 1–2 cutaways mid-clip à partir de phrases du transcript."""
    max_n = _max_shots()
    if max_n == 0 or clip_duration < 12:
        return []

    phrases: list[str] = []
    if segments:
        for seg in segments:
            t = str(seg.get("text") or "").strip()
            if len(t) > 12:
                phrases.append(t)
    if not phrases and caption:
        parts = re.split(r"[.!?]\s+", caption)
        phrases = [p.strip() for p in parts if len(p.strip()) > 12]

    if not phrases:
        phrases = [caption.strip()[:80] or "abstract cinematic texture"]

    slots = [0.28, 0.62][:max_n]
    dur = _default_duration()
    out: list[dict[str, Any]] = []
    for i, frac in enumerate(slots):
        rel = max(2.0, min(clip_duration - dur - 1.0, clip_duration * frac))
        phrase = phrases[i % len(phrases)][:100]
        out.append(
            {
                "relStartSec": round(rel, 2),
                "durationSec": dur,
                "prompt": (
                    "Cinematic vertical B-roll photo, 9:16, shallow depth of field, "
                    f"no text, no watermark, illustrating: {phrase}"
                ),
            }
        )
    return out


def _normalize_cues(
    raw: list[dict[str, Any]],
    clip_duration: float,
) -> list[dict[str, Any]]:
    max_n = _max_shots()
    cues: list[dict[str, Any]] = []
    for item in raw:
        try:
            rel = float(item.get("relStartSec", item.get("startSec", 0)))
            dur = float(item.get("durationSec", _default_duration()))
            prompt = str(item.get("prompt") or "").strip()
        except (TypeError, ValueError):
            continue
        if not prompt:
            continue
        dur = max(1.0, min(2.8, dur))
        if rel < 1.5:
            rel = 1.5
        if rel + dur > clip_duration - 0.5:
            rel = max(1.5, clip_duration - dur - 0.5)
        if rel + dur > clip_duration:
            continue
        cues.append(
            {
                "relStartSec": round(rel, 2),
                "durationSec": round(dur, 2),
                "prompt": prompt[:400],
            }
        )
        if len(cues) >= max_n:
            break
    return cues


def resolve_broll_cues(
    *,
    clip_duration: float,
    caption_text: str | None,
    caption_segments: list[dict[str, Any]] | None,
    payload_cues: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if not broll_enabled() or _max_shots() == 0:
        return []

    if payload_cues:
        cues = _normalize_cues(payload_cues, clip_duration)
        if cues:
            return cues

    caption = (caption_text or "").strip()
    if not caption and caption_segments:
        caption = " ".join(
            str(s.get("text") or "").strip() for s in caption_segments if s
        )

    try:
        raw = _ollama_broll(caption or "mood atmosphere", clip_duration)
        cues = _normalize_cues(raw, clip_duration)
        if cues:
            return cues
    except Exception as e:
        log.warning("Ollama B-roll indisponible (%s) — heuristique", e)

    return _normalize_cues(
        _heuristic_broll(caption, clip_duration, caption_segments),
        clip_duration,
    )


def generate_broll_images(
    cues: list[dict[str, Any]],
    work_dir: Path,
) -> list[dict[str, Any]]:
    """
    Génère des PNG pour chaque cue. Ignore les échecs individuels.
    Retourne cues enrichis avec imagePath.
    """
    if not cues:
        return []

    from generators.image import generate_image

    ready: list[dict[str, Any]] = []
    for i, cue in enumerate(cues):
        out = work_dir / f"broll_{i:02d}.png"
        try:
            # Résolution B-roll dédiée (plus légère si définie)
            prev_w = os.environ.get("SD_WIDTH")
            prev_h = os.environ.get("SD_HEIGHT")
            os.environ["SD_WIDTH"] = os.getenv("BROLL_WIDTH", "576")
            os.environ["SD_HEIGHT"] = os.getenv("BROLL_HEIGHT", "1024")
            try:
                generate_image(str(cue["prompt"]), output_path=out)
            finally:
                if prev_w is None:
                    os.environ.pop("SD_WIDTH", None)
                else:
                    os.environ["SD_WIDTH"] = prev_w
                if prev_h is None:
                    os.environ.pop("SD_HEIGHT", None)
                else:
                    os.environ["SD_HEIGHT"] = prev_h

            if out.is_file() and out.stat().st_size > 0:
                ready.append({**cue, "imagePath": out})
                log.info("B-roll %d prêt @ %.1fs — %s", i, cue["relStartSec"], out.name)
        except Exception as e:
            log.warning("B-roll %d ignoré (%s)", i, e)
    return ready


def composite_broll(
    base_video: Path,
    output_path: Path,
    shots: list[dict[str, Any]],
) -> Path:
    """
    Overlay full-frame des stills sur le clip déjà reframé/captions.
    """
    if not shots:
        shutil.copy2(base_video, output_path)
        return output_path

    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg introuvable")

    cmd: list[str] = ["ffmpeg", "-y", "-i", str(base_video)]
    for shot in shots:
        cmd += ["-loop", "1", "-t", f"{float(shot['durationSec']):.3f}", "-i", str(shot["imagePath"])]

    # [0:v] base ; [1:v].. broll scaled
    n = len(shots)
    parts: list[str] = []
    for i in range(n):
        parts.append(f"[{i + 1}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[b{i}]")

    last = "[0:v]"
    for i, shot in enumerate(shots):
        start = float(shot["relStartSec"])
        end = start + float(shot["durationSec"])
        out_label = f"[v{i}]"
        parts.append(
            f"{last}[b{i}]overlay=0:0:enable='between(t\\,{start:.3f}\\,{end:.3f})'{out_label}"
        )
        last = out_label

    fc = ";".join(parts)
    cmd += [
        "-filter_complex",
        fc,
        "-map",
        last,
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    log.info("Composite B-roll ×%d → %s", n, output_path.name)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"B-roll composite failed: {proc.stderr[-800:]}")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("B-roll output vide")
    return output_path

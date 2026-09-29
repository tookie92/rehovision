"""
Propose des clips viraux (hooks) à partir d'un transcript via Ollama.

Cible Reels/TikTok : ~30s, scorés, sans doublons.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

TARGET_CLIP_SEC = 30.0
MIN_CLIP_SEC = 20.0
MAX_CLIP_SEC = 45.0
# Chevauchement max (IoU) avant dédoublonnage
MAX_IOU = 0.42
MIN_SCORE = 45

SYSTEM_PROMPT = """Tu es un monteur viral type Opus Clip / TikTok Reels.
À partir d'un transcript horodaté, propose 4 à 6 clips prêts à poster.
Durée STANDARD = 30 secondes (plage 25–35s, jamais sous 20s).

Réponds UNIQUEMENT en JSON valide:
{
  "clips": [
    {
      "title": "titre accrocheur court",
      "hookReason": "pourquoi ce passage marche (1 phrase concrète)",
      "viralScore": 78,
      "startSec": 12.5,
      "endSec": 42.5,
      "captionText": "texte principal du clip pour sous-titres",
      "broll": [
        {
          "relStartSec": 5.0,
          "durationSec": 1.8,
          "prompt": "English cinematic B-roll photo prompt, vertical 9:16, no text"
        }
      ]
    }
  ]
}
Règles:
- viralScore 0–100 : tension / émotion / clarté du hook / quotabilité
- Le hook (phrase forte) dans les 3 premières secondes du clip
- endSec - startSec ≈ 30s (idéal 25–35). JAMAIS sous 20s
- Clips NON chevauchants (fenêtres disjointes)
- Évite les intros « euh / bonjour » sans payoff
- captionText = paraphrase claire (FR si transcript FR)
- broll optionnel : 0–2 cutaways
"""


def _ollama_chat(system: str, user: str) -> str:
    base = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")
    response = requests.post(
        f"{base}/api/chat",
        json={
            "model": model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "options": {"temperature": 0.35},
        },
        timeout=300,
    )
    response.raise_for_status()
    data: dict[str, Any] = response.json()
    content = data.get("message", {}).get("content", "")
    if not content:
        raise RuntimeError(f"Réponse Ollama vide: {json.dumps(data)[:500]}")
    return content


def _format_transcript(transcript: dict[str, Any]) -> str:
    lines: list[str] = []
    for seg in transcript.get("segments") or []:
        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))
        text = str(seg.get("text", "")).strip()
        if text:
            lines.append(f"[{start:.1f}-{end:.1f}] {text}")
    return "\n".join(lines)


def _normalize_window(
    start: float,
    end: float,
    video_duration: float,
) -> tuple[float, float] | None:
    if end <= start:
        return None

    start = max(0.0, start)
    if video_duration > 0:
        end = min(video_duration, end)
    span = end - start
    if span <= 0:
        return None

    if span > MAX_CLIP_SEC:
        end = start + TARGET_CLIP_SEC
        if video_duration > 0:
            end = min(end, video_duration)
        span = end - start

    if span < MIN_CLIP_SEC:
        need = TARGET_CLIP_SEC - span
        half = need / 2.0
        new_start = max(0.0, start - half)
        new_end = end + (need - (start - new_start))
        if video_duration > 0 and new_end > video_duration:
            overflow = new_end - video_duration
            new_end = video_duration
            new_start = max(0.0, new_start - overflow)
        start, end = new_start, new_end
        span = end - start

    if video_duration > 0 and video_duration < MIN_CLIP_SEC:
        return (0.0, video_duration) if video_duration >= 8 else None

    if span < MIN_CLIP_SEC:
        if span < 15.0:
            return None
        return (round(start, 2), round(end, 2))

    return (round(start, 2), round(end, 2))


def _iou(a0: float, a1: float, b0: float, b1: float) -> float:
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    if inter <= 0:
        return 0.0
    union = max(a1, b1) - min(a0, b0)
    return inter / union if union > 0 else 0.0


def _heuristic_score(caption: str, span: float) -> int:
    score = 55
    # Proche de 30s
    score -= int(abs(span - TARGET_CLIP_SEC) * 1.2)
    words = len(caption.split())
    if words >= 25:
        score += 8
    if words < 8:
        score -= 15
    low = caption.lower()
    if any(w in low for w in ("secret", "jamais", "pourquoi", "erreur", "astuce", "choquant")):
        score += 6
    if low.startswith(("euh", "bonjour", "salut", "hey")):
        score -= 10
    return max(0, min(100, score))


def _dedupe_and_rank(clips: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Garde les meilleurs scores, drop doublons (IoU) et scores trop bas."""
    ranked = sorted(
        clips,
        key=lambda c: float(c.get("viralScore") or 0),
        reverse=True,
    )
    kept: list[dict[str, Any]] = []
    for c in ranked:
        score = float(c.get("viralScore") or 0)
        if score < MIN_SCORE and len(ranked) > 3:
            continue
        s0, s1 = float(c["startSec"]), float(c["endSec"])
        if any(
            _iou(s0, s1, float(k["startSec"]), float(k["endSec"])) > MAX_IOU
            for k in kept
        ):
            continue
        kept.append(c)
        if len(kept) >= 6:
            break
    # Re-numérote l’ordre chronologique pour l’UI
    kept.sort(key=lambda c: float(c["startSec"]))
    return kept


def _heuristic_clips(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    segments = list(transcript.get("segments") or [])
    if not segments:
        return []

    duration = float(transcript.get("duration") or segments[-1].get("end", 30))
    clips: list[dict[str, Any]] = []
    window = TARGET_CLIP_SEC
    start = float(segments[0].get("start", 0))
    order = 1
    while start < duration - 10 and order <= 8:
        end = min(start + window, duration)
        texts = [
            str(s.get("text", "")).strip()
            for s in segments
            if float(s.get("end", 0)) > start and float(s.get("start", 0)) < end
        ]
        caption = " ".join(t for t in texts if t)[:280]
        normalized = _normalize_window(start, end, duration)
        if caption and normalized:
            ns, ne = normalized
            span = ne - ns
            clips.append(
                {
                    "title": f"Clip {order}",
                    "hookReason": "Passage dense (fallback ~30s)",
                    "viralScore": _heuristic_score(caption, span),
                    "startSec": ns,
                    "endSec": ne,
                    "captionText": caption,
                }
            )
            order += 1
        start = end + 5.0
    return _dedupe_and_rank(clips)


def _parse_broll(item: dict[str, Any]) -> list[dict[str, Any]]:
    raw = item.get("broll") or item.get("brollCues") or []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for b in raw[:2]:
        if not isinstance(b, dict):
            continue
        prompt = str(b.get("prompt") or "").strip()
        if not prompt:
            continue
        try:
            rel = float(b.get("relStartSec", b.get("startSec", 0)))
            dur = float(b.get("durationSec", 1.8))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "relStartSec": round(rel, 2),
                "durationSec": round(max(1.0, min(2.8, dur)), 2),
                "prompt": prompt[:400],
            }
        )
    return out


def _parse_clips(raw: str, duration: float) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        data = json.loads(match.group(0))

    out: list[dict[str, Any]] = []
    for item in data.get("clips") or []:
        try:
            start = float(item["startSec"])
            end = float(item["endSec"])
        except (KeyError, TypeError, ValueError):
            continue
        normalized = _normalize_window(start, end, duration if duration > 0 else 0)
        if not normalized:
            continue
        start, end = normalized
        caption = str(item.get("captionText") or "")[:500]
        try:
            score = int(item.get("viralScore", 0))
        except (TypeError, ValueError):
            score = 0
        if score <= 0:
            score = _heuristic_score(caption, end - start)
        score = max(0, min(100, score))
        entry: dict[str, Any] = {
            "title": str(item.get("title") or "Clip")[:120],
            "hookReason": str(item.get("hookReason") or "")[:300],
            "viralScore": score,
            "startSec": start,
            "endSec": end,
            "captionText": caption,
        }
        broll = _parse_broll(item)
        if broll:
            entry["broll"] = broll
        out.append(entry)
    return _dedupe_and_rank(out)


def propose_clips(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    duration = float(transcript.get("duration") or 0)
    body = _format_transcript(transcript)
    if not body.strip():
        raise RuntimeError("Transcript vide — impossible de proposer des clips")

    user = (
        f"Durée totale: {duration:.1f}s\n"
        f"Cible par clip: {TARGET_CLIP_SEC:.0f}s (min {MIN_CLIP_SEC:.0f}s)\n"
        f"Score chaque clip (viralScore). Évite les doublons.\n"
        f"Langue: {transcript.get('language', 'unknown')}\n\n"
        f"Transcript:\n{body}"
    )

    try:
        raw = _ollama_chat(SYSTEM_PROMPT, user)
        clips = _parse_clips(raw, duration or 9999)
        if clips:
            return clips
    except Exception:
        pass

    clips = _heuristic_clips(transcript)
    if not clips:
        raise RuntimeError("Aucune proposition de clip")
    return clips

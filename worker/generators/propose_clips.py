"""
Propose des clips viraux (hooks) à partir d'un transcript via Ollama.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

SYSTEM_PROMPT = """Tu es un monteur viral type ChatCut / Opus Clip.
À partir d'un transcript horodaté, propose 3 à 6 clips courts (15–60s) avec un fort hook.
Réponds UNIQUEMENT en JSON valide:
{
  "clips": [
    {
      "title": "titre accrocheur court",
      "hookReason": "pourquoi ce passage marche",
      "startSec": 12.5,
      "endSec": 42.0,
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
- startSec/endSec dans les bornes du transcript
- endSec - startSec entre 15 et 60
- clips non chevauchants autant que possible
- captionText = paraphrase claire du passage (FR si transcript FR)
- broll optionnel : 0–2 cutaways, relStartSec relatif au début du clip, prompt EN sans texte dans l'image
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
            "options": {"temperature": 0.4},
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


def _heuristic_clips(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    """Fallback si le LLM échoue : découpe en fenêtres ~30s sur segments denses."""
    segments = list(transcript.get("segments") or [])
    if not segments:
        return []

    duration = float(transcript.get("duration") or segments[-1].get("end", 30))
    clips: list[dict[str, Any]] = []
    window = 30.0
    start = float(segments[0].get("start", 0))
    order = 1
    while start < duration - 10 and order <= 5:
        end = min(start + window, duration)
        texts = [
            str(s.get("text", "")).strip()
            for s in segments
            if float(s.get("end", 0)) > start and float(s.get("start", 0)) < end
        ]
        caption = " ".join(t for t in texts if t)[:280]
        if caption:
            clips.append(
                {
                    "title": f"Clip {order}",
                    "hookReason": "Passage dense (fallback)",
                    "startSec": round(start, 2),
                    "endSec": round(end, 2),
                    "captionText": caption,
                }
            )
            order += 1
        start = end + 5.0
    return clips


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
        if end <= start:
            continue
        start = max(0.0, start)
        end = min(duration, end) if duration > 0 else end
        if end - start < 8:
            continue
        if end - start > 75:
            end = start + 60
        entry: dict[str, Any] = {
            "title": str(item.get("title") or "Clip")[:120],
            "hookReason": str(item.get("hookReason") or "")[:300],
            "startSec": round(start, 2),
            "endSec": round(end, 2),
            "captionText": str(item.get("captionText") or "")[:500],
        }
        broll = _parse_broll(item)
        if broll:
            entry["broll"] = broll
        out.append(entry)
    return out[:8]


def propose_clips(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    duration = float(transcript.get("duration") or 0)
    body = _format_transcript(transcript)
    if not body.strip():
        raise RuntimeError("Transcript vide — impossible de proposer des clips")

    user = (
        f"Durée totale: {duration:.1f}s\n"
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

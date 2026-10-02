"""
Propose des clips viraux (hooks) à partir d'un transcript via Ollama.

Cible Reels/TikTok : ~30s, scorés, sans doublons.
Sur vlogs longs : viser 5–8 clips (pas seulement 2).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import requests

log = logging.getLogger("rehovision-worker.propose_clips")

TARGET_CLIP_SEC = 30.0
MIN_CLIP_SEC = 20.0
MAX_CLIP_SEC = 45.0
# Chevauchement max (IoU) avant dédoublonnage
MAX_IOU = 0.42
MIN_SCORE = 35
MAX_CLIPS = 8
# Budget chars pour Ollama (vlogs YT longs → sinon timeout / JSON cassé → "Clip N")
MAX_TRANSCRIPT_CHARS = 14_000

SYSTEM_PROMPT = """Tu es un monteur viral type Opus Clip / TikTok Reels.
À partir d'un transcript horodaté, propose 5 à 8 clips prêts à poster.
Sur une vidéo longue (>10 min), vise 6–8 clips répartis sur toute la durée.
Durée STANDARD = 30 secondes (plage 25–35s, jamais sous 20s).

Réponds UNIQUEMENT en JSON valide:
{
  "clips": [
    {
      "title": "titre accrocheur court (3–7 mots, FR, PAS « Clip 1 »)",
      "hookReason": "pourquoi ce passage marche (1 phrase concrète)",
      "viralScore": 78,
      "postTitle": "caption sociale prête à coller (1–2 phrases, hook + contexte, FR)",
      "postKeywords": "#sujet #niche #contexte",
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
- title OBLIGATOIRE : hook punchy en français (ex. « Posé un lapin ?! »), jamais « Clip 1/2 »
- postTitle : caption TikTok/Reels/Shorts (max ~150 car., sans hashtags dedans)
- postKeywords : 4–6 hashtags SPÉCIFIQUES au sujet du clip (FR ou EN courant).
  INTERDIT de ne mettre que #viral #fyp #shorts #reels #pourtoi.
  Mélange : 3–4 niche/topic + au plus 1–2 découvrabilité (#fyp OU #shorts, pas les deux piles).
- viralScore 0–100 : tension / émotion / clarté du hook / quotabilité
- Le hook (phrase forte) dans les 3 premières secondes du clip
- endSec - startSec ≈ 30s (idéal 25–35). JAMAIS sous 20s
- Clips NON chevauchants (fenêtres disjointes)
- Couvre le début, le milieu ET la fin du transcript (pas seulement l'intro)
- Évite les intros « euh / bonjour » sans payoff
- captionText = paraphrase claire (FR si transcript FR)
- broll optionnel : 0–2 cutaways
"""

# Styles caption / hashtags par plateforme (regen UI TikTok|Reels|Shorts).
_PLATFORM_GUIDE: dict[str, dict[str, str]] = {
    "tiktok": {
        "label": "TikTok",
        "caption": (
            "postTitle: 1–2 phrases FR, hook dans les 8 premiers mots, "
            "curiosité / punch (pas d’intro « Dans cette vidéo »). Max ~140 car. Sans hashtags."
        ),
        "tags": (
            "postKeywords: 4–6 hashtags. 3–4 liés au SUJET précis du clip "
            "(personnes, lieux, thèmes, émotions). "
            "Puis AU PLUS 1–2 découvrabilité parmi #fyp #pourtoi #viral — pas tous. "
            "Interdit: pile générique #shorts #reels #viral seule."
        ),
        "fallback_disc": ["#fyp", "#pourtoi"],
    },
    "reels": {
        "label": "Instagram Reels",
        "caption": (
            "postTitle: 1–2 phrases FR ton Instagram (propre, storytelling léger). "
            "Peut finir par une micro-CTA (ex. « tu kiffes ? »). Max ~150 car. Sans hashtags."
        ),
        "tags": (
            "postKeywords: 4–6 hashtags. Priorité niche/sujet. "
            "Inclure #reels une seule fois. Éviter #fyp #pourtoi (style TikTok). "
            "Pas de #shorts sauf si le sujet est YouTube."
        ),
        "fallback_disc": ["#reels", "#instagram"],
    },
    "shorts": {
        "label": "YouTube Shorts",
        "caption": (
            "postTitle: titre clair quasi-SEO (sujet + angle), FR, lisible hors contexte. "
            "Moins « slang TikTok », plus descriptif. Max ~100 car. Sans hashtags."
        ),
        "tags": (
            "postKeywords: 4–6 hashtags. Toujours #shorts. "
            "Reste = sujets/thèmes précis du clip. Éviter #fyp #pourtoi #reels en masse."
        ),
        "fallback_disc": ["#shorts", "#youtube"],
    },
}


def _normalize_platform(raw: str | None) -> str:
    p = (raw or "reels").strip().lower()
    if p in _PLATFORM_GUIDE:
        return p
    if p in {"ig", "instagram", "reel"}:
        return "reels"
    if p in {"yt", "youtube", "short"}:
        return "shorts"
    if p in {"tt", "tik_tok"}:
        return "tiktok"
    return "reels"


def _slug_tags_from_text(*parts: str, limit: int = 4) -> list[str]:
    """Hashtags niche naïfs depuis titre/caption (fallback sans LLM)."""
    blob = " ".join(p for p in parts if p).lower()
    stop = {
        "le",
        "la",
        "les",
        "un",
        "une",
        "des",
        "de",
        "du",
        "et",
        "en",
        "à",
        "a",
        "au",
        "aux",
        "ce",
        "cette",
        "pour",
        "pas",
        "qui",
        "que",
        "dans",
        "sur",
        "avec",
        "tout",
        "tous",
        "mais",
        "plus",
        "clip",
        "video",
        "vidéo",
        "shorts",
        "reels",
        "tiktok",
        "youtube",
        "the",
        "and",
        "for",
        "you",
        "this",
    }
    words = re.findall(r"[a-zàâäéèêëïîôùûüç0-9]{4,}", blob, flags=re.I)
    tags: list[str] = []
    for w in words:
        wl = w.lower()
        if wl in stop:
            continue
        t = f"#{wl}"[:40]
        if t.lower() not in {x.lower() for x in tags}:
            tags.append(t)
        if len(tags) >= limit:
            break
    return tags


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


def _sample_transcript_for_llm(body: str, max_chars: int = MAX_TRANSCRIPT_CHARS) -> str:
    """Échantillonne début / milieu / fin si transcript trop long pour Ollama."""
    if len(body) <= max_chars:
        return body
    lines = body.split("\n")
    if len(lines) <= 40:
        return body[:max_chars]
    third = max(1, len(lines) // 3)
    budget = max_chars // 3
    head = "\n".join(lines[:third])[:budget]
    mid_lines = lines[third : 2 * third]
    mid = "\n".join(mid_lines)[:budget]
    tail = "\n".join(lines[2 * third :])[:budget]
    return (
        f"{head}\n"
        f"…[milieu omis]…\n"
        f"{mid}\n"
        f"…[suite omise]…\n"
        f"{tail}"
    )


_GENERIC_TITLE = re.compile(
    r"^(clip\s*\d*|hook\s*\d*|titre|untitled|sans titre)?$",
    re.I,
)


def _title_from_caption(caption: str, order: int) -> str:
    """Titre punchy depuis le texte (fallback si Ollama / heuristique)."""
    raw = re.sub(r"\s+", " ", (caption or "").strip())
    if not raw:
        return f"Moment {order}"
    # Première phrase / bout de phrase
    chunk = re.split(r"[.!?\n]", raw, maxsplit=1)[0].strip() or raw
    words = chunk.split()
    if len(words) > 8:
        chunk = " ".join(words[:8])
    if len(chunk) > 56:
        chunk = chunk[:53].rstrip() + "…"
    if chunk and chunk[0].islower():
        chunk = chunk[0].upper() + chunk[1:]
    return chunk


def _normalize_keywords(raw: str) -> str:
    parts = re.findall(r"[#\wÀ-ÿ]+", (raw or "").strip(), flags=re.UNICODE)
    tags: list[str] = []
    for p in parts:
        t = p if p.startswith("#") else f"#{p}"
        t = t[:40]
        if t.lower() not in {x.lower() for x in tags}:
            tags.append(t)
        if len(tags) >= 8:
            break
    return " ".join(tags)


def _fallback_post_meta(
    title: str,
    caption: str,
    platform: str = "reels",
) -> tuple[str, str]:
    plat = _normalize_platform(platform)
    guide = _PLATFORM_GUIDE[plat]
    base = (caption or title or "").strip()
    post = base[:150] if base else (title or "Clip")[:150]
    niche = _slug_tags_from_text(title, caption, limit=4)
    disc = list(guide["fallback_disc"])
    tags = _normalize_keywords(" ".join(niche + disc))
    if not tags:
        tags = " ".join(disc)
    return post, tags


def generate_post_meta(
    *,
    title: str,
    caption: str = "",
    hook_reason: str = "",
    platform: str = "reels",
) -> dict[str, str]:
    """Génère postTitle + postKeywords ciblés plateforme (TikTok / Reels / Shorts)."""
    plat = _normalize_platform(platform)
    guide = _PLATFORM_GUIDE[plat]
    system = (
        f"Tu es social media manager {guide['label']}. "
        "Réponds UNIQUEMENT en JSON: "
        '{"postTitle":"...","postKeywords":"#a #b #c #d"}'
    )
    user = (
        f"Plateforme: {guide['label']}\n"
        f"Titre cut: {title}\n"
        f"Pourquoi ce hook: {hook_reason}\n"
        f"Caption vidéo / sous-titres: {caption}\n\n"
        f"{guide['caption']}\n"
        f"{guide['tags']}\n"
        "Hashtags = espaces séparés, chacun commence par #."
    )
    try:
        raw = _ollama_chat(system, user)
        data = json.loads(raw)
        post = str(data.get("postTitle") or "").strip()[:200]
        keys = _normalize_keywords(str(data.get("postKeywords") or ""))
        if not post:
            post, keys = _fallback_post_meta(title, caption, plat)
        if not keys:
            _, keys = _fallback_post_meta(title, caption, plat)
        return {"postTitle": post, "postKeywords": keys}
    except Exception as e:
        log.warning("generate_post_meta fallback: %s", e)
        post, keys = _fallback_post_meta(title, caption, plat)
        return {"postTitle": post, "postKeywords": keys}


def _normalize_title(title: str, caption: str, order: int) -> str:
    t = re.sub(r"\s+", " ", (title or "").strip())
    if not t or _GENERIC_TITLE.match(t) or t.lower().startswith("clip "):
        return _title_from_caption(caption, order)
    return t[:120]


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
        if len(kept) >= MAX_CLIPS:
            break
    # Re-numérote l’ordre chronologique pour l’UI
    kept.sort(key=lambda c: float(c["startSec"]))
    return kept


def _heuristic_clips(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    segments = list(transcript.get("segments") or [])
    if not segments:
        return []

    duration = float(transcript.get("duration") or segments[-1].get("end", 30))
    # Densité : ~1 clip / 2–3 min sur longs vlogs, plafonné à MAX_CLIPS
    target_n = min(MAX_CLIPS, max(5, int(duration / 150) + 2))
    clips: list[dict[str, Any]] = []
    window = TARGET_CLIP_SEC
    gap = max(3.0, (duration - window * target_n) / max(1, target_n))
    start = float(segments[0].get("start", 0))
    order = 1
    while start < duration - 10 and order <= target_n:
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
                    "title": _title_from_caption(caption, order),
                    "hookReason": "Passage dense (fallback ~30s)",
                    "viralScore": _heuristic_score(caption, span),
                    "startSec": ns,
                    "endSec": ne,
                    "captionText": caption,
                }
            )
            order += 1
        start = end + gap
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
    for i, item in enumerate(data.get("clips") or [], start=1):
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
            "title": _normalize_title(str(item.get("title") or ""), caption, i),
            "hookReason": str(item.get("hookReason") or "")[:300],
            "viralScore": score,
            "startSec": start,
            "endSec": end,
            "captionText": caption,
        }
        post = str(item.get("postTitle") or "").strip()[:200]
        keys = _normalize_keywords(str(item.get("postKeywords") or ""))
        if not post:
            post, keys_fb = _fallback_post_meta(entry["title"], caption)
            keys = keys or keys_fb
        entry["postTitle"] = post
        entry["postKeywords"] = keys or _fallback_post_meta(
            entry["title"], str(entry.get("captionText") or ""), "reels"
        )[1]
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

    target = 6 if duration >= 600 else 5
    if duration >= 1200:
        target = 8
    body_for_llm = _sample_transcript_for_llm(body)
    user = (
        f"Durée totale: {duration:.1f}s\n"
        f"Propose environ {target} clips (min 5, max {MAX_CLIPS}), "
        f"répartis sur TOUTE la durée.\n"
        f"Cible par clip: {TARGET_CLIP_SEC:.0f}s (min {MIN_CLIP_SEC:.0f}s)\n"
        f"Score chaque clip (viralScore). Évite les doublons.\n"
        f"Chaque clip DOIT avoir un title accrocheur FR (pas « Clip N »).\n"
        f"Langue: {transcript.get('language', 'unknown')}\n\n"
        f"Transcript:\n{body_for_llm}"
    )

    try:
        raw = _ollama_chat(SYSTEM_PROMPT, user)
        clips = _parse_clips(raw, duration or 9999)
        if clips:
            for i, c in enumerate(clips, start=1):
                c["title"] = _normalize_title(
                    str(c.get("title") or ""),
                    str(c.get("captionText") or ""),
                    i,
                )
            return clips
        log.warning("Ollama a renvoyé 0 clips parsables — fallback heuristique")
    except Exception as e:
        log.warning("propose_clips Ollama échoué (%s) — fallback heuristique", e)

    clips = _heuristic_clips(transcript)
    if not clips:
        raise RuntimeError("Aucune proposition de clip")
    return clips

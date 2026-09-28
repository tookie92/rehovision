"""
Captions virales (ASS) synchronisées sur le transcript Whisper.
Phrases courtes + karaoke mot-à-mot quand les timestamps mots sont dispo.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

log = logging.getLogger("rehovision-worker.captions")

VIDEO_W = 1080
VIDEO_H = 1920


def _find_font_name() -> str:
    return "Arial"


def _format_ass_time(seconds: float) -> str:
    s = max(0.0, float(seconds))
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f"{h}:{m:02d}:{sec:05.2f}"


def _escape_ass(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", "\\N")
    )


def _safe_sub_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace(":", "\\:")


def _overlap(
    a0: float, a1: float, b0: float, b1: float
) -> tuple[float, float] | None:
    start = max(a0, b0)
    end = min(a1, b1)
    if end - start < 0.05:
        return None
    return start, end


def _words_from_segment(seg: dict[str, Any]) -> list[dict[str, float | str]]:
    raw = seg.get("words")
    out: list[dict[str, float | str]] = []
    if isinstance(raw, list):
        for w in raw:
            if not isinstance(w, dict):
                continue
            word = str(w.get("word") or w.get("text") or "").strip()
            if not word:
                continue
            try:
                ws = float(w.get("start", seg.get("start", 0)))
                we = float(w.get("end", seg.get("end", ws + 0.2)))
            except (TypeError, ValueError):
                continue
            out.append({"word": word, "start": ws, "end": max(we, ws + 0.05)})
        if out:
            return out

    # Fallback : répartir les mots linéairement sur le segment
    text = str(seg.get("text") or "").strip()
    tokens = [t for t in re.split(r"\s+", text) if t]
    if not tokens:
        return []
    try:
        s0 = float(seg.get("start", 0))
        s1 = float(seg.get("end", s0 + 1))
    except (TypeError, ValueError):
        return []
    dur = max(0.2, s1 - s0)
    step = dur / len(tokens)
    for i, tok in enumerate(tokens):
        out.append(
            {
                "word": tok,
                "start": s0 + i * step,
                "end": s0 + (i + 1) * step,
            }
        )
    return out


def _chunk_words(
    words: list[dict[str, float | str]], chunk_size: int
) -> list[list[dict[str, float | str]]]:
    if chunk_size < 1:
        chunk_size = 4
    return [words[i : i + chunk_size] for i in range(0, len(words), chunk_size)]


def build_cues_for_clip(
    segments: list[dict[str, Any]],
    clip_start: float,
    clip_end: float,
    *,
    words_per_cue: int | None = None,
) -> list[tuple[float, float, str]]:
    """
    Retourne des cues (start, end, texte ASS) relatifs au début du clip.
    Texte peut contenir des tags {\\kN} pour karaoke.
    """
    n = words_per_cue or int(os.getenv("CAPTION_WORDS_PER_CUE", "4"))
    use_karaoke = os.getenv("CAPTION_KARAOKE", "1") not in ("0", "false", "False")

    all_words: list[dict[str, float | str]] = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        for w in _words_from_segment(seg):
            ov = _overlap(
                float(w["start"]),
                float(w["end"]),
                clip_start,
                clip_end,
            )
            if not ov:
                continue
            ws, we = ov
            all_words.append({"word": str(w["word"]), "start": ws, "end": we})

    if not all_words:
        return []

    cues: list[tuple[float, float, str]] = []
    for chunk in _chunk_words(all_words, n):
        if not chunk:
            continue
        abs_start = float(chunk[0]["start"])
        abs_end = float(chunk[-1]["end"])
        rel_start = max(0.0, abs_start - clip_start)
        rel_end = max(rel_start + 0.12, abs_end - clip_start)
        # Ne pas dépasser la durée du clip
        clip_dur = max(0.2, clip_end - clip_start)
        if rel_start >= clip_dur:
            continue
        rel_end = min(rel_end, clip_dur)

        if use_karaoke and len(chunk) > 1:
            parts: list[str] = []
            for w in chunk:
                dur_cs = max(1, int(round((float(w["end"]) - float(w["start"])) * 100)))
                parts.append(f"{{\\k{dur_cs}}}{_escape_ass(str(w['word']))}")
            text = " ".join(parts)
        else:
            text = _escape_ass(" ".join(str(w["word"]) for w in chunk))

        cues.append((rel_start, rel_end, text))

    return cues


def write_viral_ass(path: Path, cues: list[tuple[float, float, str]]) -> Path:
    font = os.getenv("CAPTION_FONT", _find_font_name())
    fontsize = int(os.getenv("CAPTION_FONT_SIZE", "68"))
    # &HAABBGGRR — blanc + cyan signal en secondary (karaoke)
    primary = "&H00FFFFFF"
    secondary = "&H003DD6C6"
    outline = "&H00000000"
    margin_v = int(os.getenv("CAPTION_MARGIN_V", "260"))

    header = f"""[Script Info]
Title: Rehovision Viral Captions
ScriptType: v4.00+
PlayResX: {VIDEO_W}
PlayResY: {VIDEO_H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Viral,{font},{fontsize},{primary},{secondary},{outline},&H80000000,-1,0,0,0,100,100,0,0,1,5,0,2,70,70,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in cues:
        if not text.strip():
            continue
        lines.append(
            f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},"
            f"Viral,,0,0,0,,{text}\n"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines), encoding="utf-8")
    log.info("ASS captions → %s (%d cues)", path.name, len(cues))
    return path


def ass_filter_arg(ass_path: Path) -> str:
    return f"subtitles={_safe_sub_path(ass_path)}"


def cues_from_caption_text(
    caption_text: str,
    duration: float,
    *,
    words_per_cue: int | None = None,
) -> list[tuple[float, float, str]]:
    """Fallback si pas de segments Whisper : découpe le captionText dans le temps."""
    text = re.sub(r"\s+", " ", (caption_text or "").strip())
    if not text or duration <= 0:
        return []
    n = words_per_cue or int(os.getenv("CAPTION_WORDS_PER_CUE", "4"))
    tokens = text.split(" ")
    chunks = [" ".join(tokens[i : i + n]) for i in range(0, len(tokens), n)]
    if not chunks:
        return []
    step = duration / len(chunks)
    cues: list[tuple[float, float, str]] = []
    for i, chunk in enumerate(chunks):
        cues.append((i * step, min(duration, (i + 1) * step), _escape_ass(chunk)))
    return cues

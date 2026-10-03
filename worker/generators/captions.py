"""
Captions virales (ASS) synchronisées sur le transcript Whisper.
Style CapCut-like : Montserrat ExtraBold, karaoke + pop mot-à-mot, outline fort.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger("rehovision-worker.captions")

VIDEO_W = 1080
VIDEO_H = 1920

# Polices display type CapCut (ordre de préférence)
_FONT_CANDIDATES = (
    "Montserrat ExtraBold",
    "Montserrat Black",
    "Montserrat Bold",
    "Impact",
    "Arial Black",
    "DejaVu Sans Bold",
    "DejaVu Sans",
    "Liberation Sans Bold",
    "Arial",
)

_FONTSDIR_CANDIDATES = (
    "/usr/share/fonts/truetype/montserrat",
    "/usr/share/fonts/opentype/montserrat",
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts/truetype/msttcorefonts",
)


def _find_fonts_dir() -> str | None:
    env = (os.getenv("CAPTION_FONTSDIR") or "").strip()
    if env and Path(env).is_dir():
        return env
    for d in _FONTSDIR_CANDIDATES:
        if Path(d).is_dir():
            return d
    return None


def _find_font_name() -> str:
    env = (os.getenv("CAPTION_FONT") or "").strip()
    if env:
        return env
    if shutil.which("fc-list"):
        for name in _FONT_CANDIDATES:
            try:
                # Match exact family string when possible
                r = subprocess.run(
                    ["fc-list", f":family={name}", "file"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    check=False,
                )
                if r.stdout.strip():
                    return name
                # Fallback: first token family (Montserrat)
                family = name.split()[0]
                r2 = subprocess.run(
                    ["fc-list", f":family={family}", "file"],
                    capture_output=True,
                    text=True,
                    timeout=3,
                    check=False,
                )
                if r2.stdout.strip() and "ExtraBold" in name:
                    # Prefer ExtraBold face name if file exists
                    if "ExtraBold" in r2.stdout or "Black" in r2.stdout:
                        return name
                    return "Montserrat"
                if r2.stdout.strip():
                    return name if " " not in name else family
            except Exception:
                continue
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


def _safe_sub_path(path: Path | str) -> str:
    return str(Path(path).resolve()).replace("\\", "/").replace(":", "\\:")


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
            out.append({"word": word, "start": ws, "end": max(we, ws + 0.08)})
        if out:
            return out

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
        chunk_size = 2
    return [words[i : i + chunk_size] for i in range(0, len(words), chunk_size)]


def _word_ass_tag(dur_cs: int, *, pop: bool, highlight: str) -> str:
    """
    Karaoke CapCut-like :
    - \\k : fill Secondary → Primary
    - flash couleur highlight + scale pop sur le mot actif
    """
    dur_cs = max(3, int(dur_cs))
    if not pop:
        return f"{{\\k{dur_cs}}}"
    up = min(14, max(5, dur_cs // 3))
    down = min(dur_cs, up + max(8, dur_cs // 2))
    # highlight = BGR ASS (&HAABBGGRR)
    return (
        f"{{\\k{dur_cs}"
        f"\\1c{highlight}"
        f"\\t(0,{up},\\fscx122\\fscy122)"
        f"\\t({up},{down},\\fscx100\\fscy100\\1c&H00FFFFFF&)}}"
    )


def build_cues_for_clip(
    segments: list[dict[str, Any]],
    clip_start: float,
    clip_end: float,
    *,
    words_per_cue: int | None = None,
) -> list[tuple[float, float, str]]:
    """
    Retourne des cues (start, end, texte ASS) relatifs au début du clip.
    """
    # CapCut : 2 mots / ligne = plus lisible / punchy que 3–4
    n = words_per_cue or int(os.getenv("CAPTION_WORDS_PER_CUE", "2"))
    use_karaoke = os.getenv("CAPTION_KARAOKE", "1") not in ("0", "false", "False")
    use_pop = os.getenv("CAPTION_WORD_POP", "1") not in ("0", "false", "False")
    # Jaune punch CapCut (BGR)
    highlight = (os.getenv("CAPTION_HIGHLIGHT") or "&H0000E5FF").strip()

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
        # Légère extension pour lisibilité (CapCut ne coupe pas trop court)
        abs_end = max(abs_end, abs_start + 0.18 * len(chunk))
        rel_start = max(0.0, abs_start - clip_start)
        rel_end = max(rel_start + 0.16, abs_end - clip_start)
        clip_dur = max(0.2, clip_end - clip_start)
        if rel_start >= clip_dur:
            continue
        rel_end = min(rel_end, clip_dur)

        if use_karaoke and len(chunk) >= 1:
            parts: list[str] = []
            for w in chunk:
                dur_cs = max(
                    4, int(round((float(w["end"]) - float(w["start"])) * 100))
                )
                tag = _word_ass_tag(
                    dur_cs, pop=use_pop, highlight=highlight
                )
                parts.append(f"{tag}{_escape_ass(str(w['word']))}")
            text = " ".join(parts)
        else:
            text = _escape_ass(" ".join(str(w["word"]) for w in chunk))

        cues.append((rel_start, rel_end, text))

    return cues


def write_viral_ass(
    path: Path,
    cues: list[tuple[float, float, str]],
    style_name: str | None = None,
) -> Path:
    style_key = (style_name or os.getenv("CAPTION_STYLE", "viral")).strip().lower()
    if style_key in ("off", "none", ""):
        path.write_text("", encoding="utf-8")
        return path

    # Couleurs ASS = &HAABBGGRR
    presets: dict[str, dict[str, Any]] = {
        "viral": {
            "fontsize": 86,
            "primary": "&H00FFFFFF",
            "secondary": "&H0000E5FF",  # jaune actif (karaoke)
            "outline": "&H00000000",
            "outline_w": 10,
            "shadow": 3,
            "spacing": 1,
            "margin_v": 340,
            "uppercase": True,
        },
        "bold_green": {
            "fontsize": 88,
            "primary": "&H0000FF7A",
            "secondary": "&H00FFFFFF",
            "outline": "&H00000000",
            "outline_w": 11,
            "shadow": 3,
            "spacing": 1,
            "margin_v": 350,
            "uppercase": True,
        },
        "yellow_pop": {
            "fontsize": 88,
            "primary": "&H0000F0FF",
            "secondary": "&H00FFFFFF",
            "outline": "&H00000000",
            "outline_w": 11,
            "shadow": 3,
            "spacing": 1,
            "margin_v": 340,
            "uppercase": True,
        },
        "minimal": {
            "fontsize": 56,
            "primary": "&H00FFFFFF",
            "secondary": "&H00DDDDDD",
            "outline": "&H00000000",
            "outline_w": 5,
            "shadow": 2,
            "spacing": 0,
            "margin_v": 220,
            "uppercase": False,
        },
        "neon_pink": {
            "fontsize": 86,
            "primary": "&H00FF66FF",
            "secondary": "&H00FFFFFF",
            "outline": "&H001A0014",
            "outline_w": 10,
            "shadow": 4,
            "spacing": 1,
            "margin_v": 340,
            "uppercase": True,
        },
        "impact": {
            "fontsize": 96,
            "primary": "&H00FFFFFF",
            "secondary": "&H0000D7FF",
            "outline": "&H00000000",
            "outline_w": 12,
            "shadow": 4,
            "spacing": 2,
            "margin_v": 360,
            "uppercase": True,
        },
    }
    preset = presets.get(style_key, presets["viral"])
    font = _find_font_name()
    fontsize = int(os.getenv("CAPTION_FONT_SIZE", str(preset["fontsize"])))
    primary = str(preset["primary"])
    secondary = str(preset["secondary"])
    outline = str(preset["outline"])
    outline_w = int(preset["outline_w"])
    shadow = int(preset.get("shadow", 3))
    spacing = int(preset.get("spacing", 0))
    margin_v = int(os.getenv("CAPTION_MARGIN_V", str(preset["margin_v"])))
    do_upper = bool(preset.get("uppercase"))

    header = f"""[Script Info]
Title: Rehovision Captions ({style_key})
ScriptType: v4.00+
PlayResX: {VIDEO_W}
PlayResY: {VIDEO_H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Viral,{font},{fontsize},{primary},{secondary},{outline},&H80000000,-1,0,0,0,100,100,{spacing},0,1,{outline_w},{shadow},2,48,48,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in cues:
        if not text.strip():
            continue
        if do_upper:
            parts = re.split(r"(\{[^}]*\})", text)
            text = "".join(
                p if p.startswith("{") else p.upper() for p in parts
            )
        lines.append(
            f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},"
            f"Viral,,0,0,0,,{text}\n"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines), encoding="utf-8")
    log.info(
        "ASS captions style=%s font=%s outline=%s → %s (%d cues)",
        style_key,
        font,
        outline_w,
        path.name,
        len(cues),
    )
    return path


def ass_filter_arg(ass_path: Path) -> str:
    """
    Filtre ffmpeg subtitles=… avec fontsdir (sinon libass ignore Montserrat
    → police fine moche type « captions qui craignent »).
    """
    path = _safe_sub_path(ass_path)
    fonts = _find_fonts_dir()
    if fonts:
        return f"subtitles={path}:fontsdir={_safe_sub_path(fonts)}"
    return f"subtitles={path}"


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
    n = words_per_cue or int(os.getenv("CAPTION_WORDS_PER_CUE", "2"))
    tokens = text.split(" ")
    chunks = [" ".join(tokens[i : i + n]) for i in range(0, len(tokens), n)]
    if not chunks:
        return []
    step = duration / len(chunks)
    highlight = (os.getenv("CAPTION_HIGHLIGHT") or "&H0000E5FF").strip()
    use_pop = os.getenv("CAPTION_WORD_POP", "1") not in ("0", "false", "False")
    cues: list[tuple[float, float, str]] = []
    for i, chunk in enumerate(chunks):
        t0 = i * step
        t1 = min(duration, (i + 1) * step)
        words = chunk.split(" ")
        if len(words) <= 1 or not use_pop:
            cues.append((t0, t1, _escape_ass(chunk)))
            continue
        # Mini karaoke linéaire sur le fallback
        wstep = (t1 - t0) / len(words)
        parts: list[str] = []
        for j, w in enumerate(words):
            dur_cs = max(4, int(round(wstep * 100)))
            parts.append(
                f"{_word_ass_tag(dur_cs, pop=True, highlight=highlight)}"
                f"{_escape_ass(w)}"
            )
        cues.append((t0, t1, " ".join(parts)))
    return cues

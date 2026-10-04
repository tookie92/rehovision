"""
Livre audio Couche B :
  texte long → chapitres/paragraphes → (trad) → TTS chunk → concat ffmpeg
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from engines.translate import can_auto_translate, translate
from engines.voice import generate_voice, prepare_clone_ref

log = logging.getLogger("engines.audiobook")

ProgressCb = Callable[[int, str], None]

_CHAPTER_RE = re.compile(
    r"^(?:#{1,3}\s+|(?:chapitre|chapter|partie|part)\s+\d+\s*[:.\-—]?\s*)(.+)$",
    re.IGNORECASE,
)
_SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+")


@dataclass
class Chapter:
    title: str
    text: str


@dataclass
class AudiobookResult:
    path: Path
    chapters: list[dict]
    source_lang: str
    target_lang: str
    translated: bool
    clone: bool
    char_count: int


def split_audiobook_text(text: str, *, max_chars: int = 600) -> list[Chapter]:
    """Découpe en chapitres (titres) puis paragraphes, puis phrases si trop long."""
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return []

    lines = raw.split("\n")
    sections: list[tuple[str, list[str]]] = []
    current_title = "Chapitre 1"
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        if body:
            sections.append((current_title, [body]))
        buf = []

    for line in lines:
        m = _CHAPTER_RE.match(line.strip())
        if m:
            flush()
            current_title = m.group(1).strip() or line.strip().lstrip("#").strip()
            continue
        buf.append(line)
    flush()

    if not sections:
        sections = [("Chapitre 1", [raw])]

    # Si un seul bloc sans vrais titres, re-découper en paragraphes
    chapters: list[Chapter] = []
    for title, bodies in sections:
        body = "\n".join(bodies).strip()
        paras = [p.strip() for p in re.split(r"\n\s*\n+", body) if p.strip()]
        if len(paras) <= 1 and len(body) > max_chars:
            paras = _split_long(body, max_chars)
        elif len(paras) == 0:
            continue
        elif len(sections) == 1 and len(paras) > 1:
            for i, para in enumerate(paras, start=1):
                for piece in _split_long(para, max_chars):
                    chapters.append(Chapter(title=f"Paragraphe {i}", text=piece))
            continue

        for i, para in enumerate(paras):
            pieces = _split_long(para, max_chars)
            for j, piece in enumerate(pieces):
                label = title if i == 0 and j == 0 else f"{title} · {i + 1}"
                if len(pieces) > 1:
                    label = f"{label}.{j + 1}"
                chapters.append(Chapter(title=label, text=piece))

    # Numérotation propre si trop de « Paragraphe »
    if len(chapters) == 1:
        return chapters
    return chapters


def _split_long(text: str, max_chars: int) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    sentences = _SENTENCE_RE.split(text)
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if not cur:
            cur = s
        elif len(cur) + 1 + len(s) <= max_chars:
            cur = f"{cur} {s}"
        else:
            chunks.append(cur)
            cur = s
    if cur:
        chunks.append(cur)
    # Hard cut fallback
    out: list[str] = []
    for c in chunks:
        if len(c) <= max_chars:
            out.append(c)
            continue
        for i in range(0, len(c), max_chars):
            out.append(c[i : i + max_chars].strip())
    return [x for x in out if x]


def run_audiobook(
    *,
    text: str,
    source_lang: str,
    target_lang: str,
    instruct: str | None = None,
    clone_voice: bool = False,
    ref_audio_path: Path | None = None,
    speed: float | None = None,
    max_chars: int = 600,
    pause_ms: int = 350,
    on_progress: ProgressCb | None = None,
) -> AudiobookResult:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    source_lang = (source_lang or "fr").split("-")[0].lower()
    target_lang = (target_lang or "fr").split("-")[0].lower()
    text = (text or "").strip()
    if not text:
        raise ValueError("Texte audiobook vide")

    chapters = split_audiobook_text(text, max_chars=max_chars)
    if not chapters:
        raise ValueError("Aucun chapitre / paragraphe détecté")
    if len(chapters) > 80:
        raise RuntimeError(
            f"Trop de segments ({len(chapters)}). Regroupe le texte ou "
            "augmente la taille des chunks."
        )

    prog(8, f"{len(chapters)} segment(s) détecté(s)")

    need_tr = source_lang != target_lang
    if need_tr and not can_auto_translate(source_lang, target_lang):
        raise RuntimeError(
            f"Traduction auto indisponible pour {source_lang}→{target_lang}"
        )

    # Clone ref une seule fois
    ref_path = None
    ref_text = None
    if clone_voice:
        if ref_audio_path is None or not ref_audio_path.is_file():
            raise RuntimeError(
                "Mode clone : échantillon de voix requis pour l’audiobook."
            )
        prog(12, "Préparation clone + Whisper ref")
        ref_path, ref_text = prepare_clone_ref(
            ref_audio_path,
            source_lang=source_lang if source_lang != "auto" else None,
        )

    try:
        from engines.gpu_util import free_vram

        prog(15, "Libération VRAM avant TTS")
        free_vram("avant audiobook TTS", unload_llm=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("free_vram: %s", exc)

    tmp_dir = Path(tempfile.mkdtemp(prefix="audiobook_"))
    chunk_wavs: list[Path] = []
    chapter_meta: list[dict] = []
    translated_any = False

    try:
        n = len(chapters)
        for i, ch in enumerate(chapters):
            # Progress 20→85 across chunks
            base_p = 20 + int(65 * i / max(n, 1))
            prog(base_p, f"Segment {i + 1}/{n} — {ch.title[:40]}")

            spoken = ch.text
            if need_tr:
                spoken = translate(ch.text, source_lang, target_lang).strip()
                translated_any = True
            if not spoken:
                raise RuntimeError(f"Segment {i + 1} vide après traduction")

            out = generate_voice(
                text=spoken,
                source_lang=source_lang,
                target_lang=target_lang,
                instruct=instruct if not ref_path else None,
                ref_audio=ref_path,
                ref_text=ref_text,
                speed=speed,
            )
            dest = tmp_dir / f"chunk_{i:03d}.wav"
            shutil.copy2(out, dest)
            chunk_wavs.append(dest)
            chapter_meta.append(
                {
                    "index": i,
                    "title": ch.title,
                    "sourceChars": len(ch.text),
                    "spokenChars": len(spoken),
                    "spokenPreview": spoken[:240],
                }
            )
            try:
                out.unlink(missing_ok=True)
            except OSError:
                pass

        prog(88, "Concaténation audio")
        final = _concat_wavs(chunk_wavs, pause_ms=pause_ms)
        prog(95, f"Livre audio prêt ({final.name})")
        return AudiobookResult(
            path=final,
            chapters=chapter_meta,
            source_lang=source_lang,
            target_lang=target_lang,
            translated=translated_any,
            clone=bool(ref_path),
            char_count=len(text),
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _concat_wavs(paths: list[Path], *, pause_ms: int = 350) -> Path:
    if not paths:
        raise RuntimeError("Aucun chunk audio")
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    from engines.voice import OUTPUT_DIR

    out = OUTPUT_DIR / f"audiobook_{abs(hash(tuple(str(p) for p in paths))) % 10_000_000}.wav"
    # Silence pad between chapters
    list_file = paths[0].parent / "concat.txt"
    silence = paths[0].parent / "silence.wav"
    if pause_ms > 0:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                f"anullsrc=r=24000:cl=mono",
                "-t",
                f"{pause_ms / 1000.0}",
                str(silence),
            ],
            check=True,
            capture_output=True,
        )

    lines: list[str] = []
    for i, p in enumerate(paths):
        lines.append(f"file '{p.resolve()}'")
        if pause_ms > 0 and i < len(paths) - 1:
            lines.append(f"file '{silence.resolve()}'")
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    proc = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0 or not out.is_file():
        # Re-encode fallback (sample rates may differ)
        proc2 = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_file),
                "-ar",
                "24000",
                "-ac",
                "1",
                str(out),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc2.returncode != 0 or not out.is_file():
            raise RuntimeError(
                f"Concat audiobook échouée: {(proc2.stderr or proc.stderr or '')[:300]}"
            )
    return out

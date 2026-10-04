"""
Livre audio Couche B :
  texte long → chapitres / dialogues → (trad) → TTS multi-voix → concat ffmpeg
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
from typing import Any, Callable

from engines.translate import can_auto_translate, translate
from engines.voice import generate_voice, prepare_clone_ref

log = logging.getLogger("engines.audiobook")

ProgressCb = Callable[[int, str], None]

_CHAPTER_RE = re.compile(
    r"^(?:#{1,3}\s+|(?:chapitre|chapter|partie|part)\s+\d+\s*[:.\-—]?\s*)(.+)$",
    re.IGNORECASE,
)
# « Alice: … » / « Bob — … » (pas d’URL, pas d’heure)
_SPEAKER_RE = re.compile(
    r"^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’\- ]{0,39}?)\s*[:：—–]\s+(.+)$"
)
_SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+")
_TAG_RE = re.compile(r"\[[^\]]+\]")
NARRATOR_KEY = "Narrateur"


@dataclass
class Passage:
    title: str
    text: str
    speaker: str  # "Narrateur" ou nom du personnage


@dataclass
class AudiobookResult:
    path: Path
    chapters: list[dict]
    source_lang: str
    target_lang: str
    translated: bool
    clone: bool
    char_count: int
    speakers_used: list[str]
    music: bool = False
    resumed_from: int = 0


def _norm_speaker(name: str) -> str:
    s = (name or "").strip()
    if not s:
        return NARRATOR_KEY
    # Normalise casse pour matching (Alice / alice)
    return s[:1].upper() + s[1:] if len(s) > 1 else s.upper()


def detect_speakers(text: str) -> list[str]:
    """Noms détectés via lignes « Nom: réplique » (hors Narrateur)."""
    found: list[str] = []
    seen: set[str] = set()
    for line in (text or "").replace("\r\n", "\n").split("\n"):
        m = _SPEAKER_RE.match(line.strip())
        if not m:
            continue
        key = _norm_speaker(m.group(1))
        low = key.casefold()
        if low in seen or low == NARRATOR_KEY.casefold():
            continue
        # Évite faux positifs genre « http: » / « Note: »
        if key.casefold() in {"http", "https", "note", "ps", "nb", "ex", "exemples"}:
            continue
        seen.add(low)
        found.append(key)
    return found


def split_audiobook_text(text: str, *, max_chars: int = 600) -> list[Passage]:
    """Découpe en chapitres, puis tours de parole / narration."""
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return []

    lines = raw.split("\n")
    sections: list[tuple[str, str]] = []
    current_title = "Chapitre 1"
    buf: list[str] = []

    def flush_sec() -> None:
        nonlocal buf
        body = "\n".join(buf).strip()
        if body:
            sections.append((current_title, body))
        buf = []

    for line in lines:
        m = _CHAPTER_RE.match(line.strip())
        if m:
            flush_sec()
            current_title = m.group(1).strip() or line.strip().lstrip("#").strip()
            continue
        buf.append(line)
    flush_sec()

    if not sections:
        sections = [("Chapitre 1", raw)]

    passages: list[Passage] = []
    for title, body in sections:
        turns = _split_dialogue_turns(body)
        if not turns:
            continue
        # Un seul bloc narratif sans dialogue → comportement historique (paragraphes)
        if len(turns) == 1 and turns[0][0] == NARRATOR_KEY:
            paras = [p.strip() for p in re.split(r"\n\s*\n+", body) if p.strip()]
            if len(paras) <= 1 and len(body) > max_chars:
                paras = _split_long(body, max_chars)
            if len(sections) == 1 and len(paras) > 1:
                for i, para in enumerate(paras, start=1):
                    for piece in _split_long(para, max_chars):
                        passages.append(
                            Passage(
                                title=f"Paragraphe {i}",
                                text=piece,
                                speaker=NARRATOR_KEY,
                            )
                        )
                continue
            for i, para in enumerate(paras):
                pieces = _split_long(para, max_chars)
                for j, piece in enumerate(pieces):
                    label = title if i == 0 and j == 0 else f"{title} · {i + 1}"
                    if len(pieces) > 1:
                        label = f"{label}.{j + 1}"
                    passages.append(
                        Passage(title=label, text=piece, speaker=NARRATOR_KEY)
                    )
            continue

        for speaker, turn_text in turns:
            pieces = _split_long(turn_text, max_chars)
            for j, piece in enumerate(pieces):
                if speaker == NARRATOR_KEY:
                    label = title if j == 0 else f"{title} · {j + 1}"
                else:
                    label = f"{title} · {speaker}" if j == 0 else f"{title} · {speaker}.{j + 1}"
                passages.append(Passage(title=label, text=piece, speaker=speaker))

    return passages


def _split_dialogue_turns(body: str) -> list[tuple[str, str]]:
    """Découpe un corps de chapitre en (speaker, texte)."""
    turns: list[tuple[str, list[str]]] = []
    cur_speaker = NARRATOR_KEY
    cur: list[str] = []

    def flush() -> None:
        nonlocal cur, cur_speaker
        text = "\n".join(cur).strip()
        if text:
            turns.append((cur_speaker, [text]))
        cur = []

    for line in body.split("\n"):
        stripped = line.strip()
        if not stripped:
            flush()
            cur_speaker = NARRATOR_KEY
            continue
        m = _SPEAKER_RE.match(stripped)
        if m:
            flush()
            name = _norm_speaker(m.group(1))
            if name.casefold() in {"http", "https", "note", "ps", "nb"}:
                cur_speaker = NARRATOR_KEY
                cur = [stripped]
            else:
                cur_speaker = name
                cur = [m.group(2).strip()]
            continue
        cur.append(stripped)
    flush()

    out: list[tuple[str, str]] = []
    for spk, parts in turns:
        out.append((spk, parts[0]))
    return out


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
    out: list[str] = []
    for c in chunks:
        if len(c) <= max_chars:
            out.append(c)
            continue
        for i in range(0, len(c), max_chars):
            out.append(c[i : i + max_chars].strip())
    return [x for x in out if x]


def _split_omnivoice_tags(text: str) -> tuple[list[str], str]:
    """
    Sépare les tags OmniVoice du texte à traduire.
    Les placeholders type NLLBTAG0X font halluciner NLLB (texte UE, etc.) —
    on retire les tags, on traduit le reste, puis on les remet en tête.
    """
    leading: list[str] = []
    rest = (text or "").strip()
    while True:
        m = re.match(r"^(\[[^\]]+\])\s*", rest)
        if not m:
            break
        leading.append(m.group(1))
        rest = rest[m.end() :].lstrip()
    # Tags restants au milieu : on les enlève aussi (réinjectés en tête)
    mid = _TAG_RE.findall(rest)
    bare = _TAG_RE.sub(" ", rest)
    bare = re.sub(r"\s+", " ", bare).strip()
    return leading + mid, bare


def _translate_spoken(text: str, source_lang: str, target_lang: str) -> str:
    tags, bare = _split_omnivoice_tags(text)
    if not bare:
        return " ".join(tags).strip()
    spoken = translate(bare, source_lang, target_lang).strip()
    if tags:
        spoken = f"{' '.join(tags)} {spoken}".strip()
    return spoken


def _speaker_entry(
    speaker: str, speakers: dict[str, Any] | None
) -> dict[str, Any] | None:
    if not speakers:
        return None
    for k, v in speakers.items():
        if str(k).casefold() == speaker.casefold():
            return v if isinstance(v, dict) else {"instruct": str(v)}
    if speaker == NARRATOR_KEY:
        for k, v in speakers.items():
            if str(k).casefold() in {"narrateur", "narrator", "_narrator"}:
                return v if isinstance(v, dict) else {"instruct": str(v)}
    return None


def _resolve_voice(
    speaker: str,
    *,
    default_instruct: str | None,
    default_ref: tuple[Path, str] | None,
    speakers: dict[str, Any] | None,
) -> tuple[str | None, Path | None, str | None]:
    """Retourne (instruct, ref_path, ref_text) pour un segment."""
    entry = _speaker_entry(speaker, speakers)
    if entry:
        ref_p = entry.get("ref_path") or entry.get("ref_audio_path")
        ref_t = entry.get("ref_text")
        if ref_p is not None and Path(ref_p).is_file():
            return None, Path(ref_p), str(ref_t or "")
        inst = str(entry.get("instruct") or "").strip()
        if inst:
            return inst, None, None
    if default_ref is not None:
        return None, default_ref[0], default_ref[1]
    return default_instruct, None, None


def passages_from_segments(segments: list[Any]) -> list[Passage]:
    """Convertit params.segments (UI) en Passage."""
    out: list[Passage] = []
    for i, raw in enumerate(segments):
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not text:
            continue
        speaker = _norm_speaker(str(raw.get("speaker") or NARRATOR_KEY))
        title = str(raw.get("title") or f"Segment {i + 1}").strip() or f"Segment {i + 1}"
        out.append(Passage(title=title[:120], text=text, speaker=speaker))
    return out


ChunkSavedCb = Callable[[int, Path, dict], None]


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
    speakers: dict[str, Any] | None = None,
    segments: list[Any] | None = None,
    music_prompt: str | None = None,
    music_volume: float = 0.18,
    music_storage_path: Path | None = None,
    checkpoint: dict[str, Any] | None = None,
    resume_chunk_paths: list[Path] | None = None,
    on_chunk_saved: ChunkSavedCb | None = None,
    on_progress: ProgressCb | None = None,
) -> AudiobookResult:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    source_lang = (source_lang or "fr").split("-")[0].lower()
    target_lang = (target_lang or "fr").split("-")[0].lower()
    text = (text or "").strip()

    if segments:
        chapters = passages_from_segments(segments)
    else:
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

    speakers_in_text = sorted(
        {p.speaker for p in chapters},
        key=lambda s: (s != NARRATOR_KEY, s.casefold()),
    )
    start_idx = 0
    if checkpoint and isinstance(checkpoint.get("nextIndex"), int):
        start_idx = max(0, min(int(checkpoint["nextIndex"]), len(chapters)))
    resumed_from = start_idx
    prog(
        8,
        f"{len(chapters)} segment(s) · {len(speakers_in_text)} voix"
        + (f" · reprise @{start_idx}" if start_idx else ""),
    )

    need_tr = source_lang != target_lang
    if need_tr and not can_auto_translate(source_lang, target_lang):
        raise RuntimeError(
            f"Traduction auto indisponible pour {source_lang}→{target_lang}"
        )

    default_ref: tuple[Path, str] | None = None
    if clone_voice and ref_audio_path is not None and ref_audio_path.is_file():
        prog(12, "Préparation clone narrateur + Whisper ref")
        default_ref = prepare_clone_ref(
            ref_audio_path,
            source_lang=source_lang if source_lang != "auto" else None,
        )
    elif clone_voice and not any(
        isinstance(v, dict)
        and (v.get("ref_path") or v.get("ref_audio_path") or v.get("refStorageId"))
        for v in (speakers or {}).values()
    ):
        raise RuntimeError(
            "Mode clone : échantillon de voix requis (global ou par personnage)."
        )

    # Prépare les clones par personnage déjà présents comme Path
    if speakers:
        for key, entry in list(speakers.items()):
            if not isinstance(entry, dict):
                continue
            rp = entry.get("ref_path") or entry.get("ref_audio_path")
            if rp and Path(rp).is_file() and not entry.get("ref_text"):
                prog(13, f"Préparation clone « {key} »")
                path, rtext = prepare_clone_ref(
                    Path(rp),
                    source_lang=source_lang if source_lang != "auto" else None,
                )
                entry["ref_path"] = path
                entry["ref_text"] = rtext

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
    default_instruct = (instruct or "").strip() or None
    used_clone = bool(default_ref)

    # Restaure chunks déjà faits
    if resume_chunk_paths:
        for i, p in enumerate(resume_chunk_paths):
            if i >= start_idx:
                break
            if p is not None and Path(p).is_file():
                dest = tmp_dir / f"chunk_{i:03d}.wav"
                shutil.copy2(p, dest)
                chunk_wavs.append(dest)
            else:
                # trou → recommencer depuis là
                start_idx = i
                chunk_wavs = chunk_wavs[:i]
                break
        if isinstance(checkpoint, dict) and isinstance(checkpoint.get("chapters"), list):
            chapter_meta = list(checkpoint["chapters"])[:start_idx]

    try:
        n = len(chapters)
        for i, ch in enumerate(chapters):
            if i < start_idx:
                continue
            base_p = 20 + int(60 * i / max(n, 1))
            prog(base_p, f"Segment {i + 1}/{n} — {ch.speaker}: {ch.title[:32]}")

            spoken = ch.text
            if need_tr:
                spoken = _translate_spoken(ch.text, source_lang, target_lang)
                translated_any = True
            if not spoken:
                raise RuntimeError(f"Segment {i + 1} vide après traduction")

            seg_instruct, seg_ref, seg_ref_text = _resolve_voice(
                ch.speaker,
                default_instruct=default_instruct,
                default_ref=default_ref,
                speakers=speakers,
            )
            if seg_ref is not None:
                used_clone = True

            out = generate_voice(
                text=spoken,
                source_lang=source_lang,
                target_lang=target_lang,
                instruct=seg_instruct if seg_ref is None else None,
                ref_audio=seg_ref,
                ref_text=seg_ref_text,
                speed=speed,
            )
            dest = tmp_dir / f"chunk_{i:03d}.wav"
            shutil.copy2(out, dest)
            chunk_wavs.append(dest)
            meta = {
                "index": i,
                "title": ch.title,
                "speaker": ch.speaker,
                "sourceChars": len(ch.text),
                "spokenChars": len(spoken),
                "spokenPreview": spoken[:240],
                "instruct": (seg_instruct or "")[:200] or None,
                "clone": bool(seg_ref),
            }
            chapter_meta.append(meta)
            try:
                out.unlink(missing_ok=True)
            except OSError:
                pass
            if on_chunk_saved:
                on_chunk_saved(i, dest, meta)

        prog(82, "Concaténation audio")
        final = _concat_wavs(chunk_wavs, pause_ms=pause_ms)

        music_on = False
        if music_storage_path and music_storage_path.is_file():
            prog(88, "Mix lit musique (fichier)")
            final = _mix_bed(final, music_storage_path, volume=music_volume)
            music_on = True
        elif music_prompt and music_prompt.strip():
            prog(86, "Génération lit musique ACE-Step")
            try:
                from engines.gpu_util import free_vram

                free_vram("avant lit musique", unload_llm=True)
            except Exception:  # noqa: BLE001
                pass
            from engines.music import generate_music

            dur = max(8, min(120, int(_wav_duration_s(final) + 1)))
            bed = generate_music(
                music_prompt.strip()[:500],
                dur,
                instrumental=True,
                lyrics="[Instrumental]",
            )
            prog(90, "Mix narration + lit")
            final = _mix_bed(final, bed, volume=music_volume)
            music_on = True

        prog(95, f"Livre audio prêt ({final.name})")
        return AudiobookResult(
            path=final,
            chapters=chapter_meta,
            source_lang=source_lang,
            target_lang=target_lang,
            translated=translated_any,
            clone=used_clone,
            char_count=len(text) if text else sum(len(c.text) for c in chapters),
            speakers_used=speakers_in_text,
            music=music_on,
            resumed_from=resumed_from,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _wav_duration_s(path: Path) -> float:
    import wave

    try:
        with wave.open(str(path), "rb") as wf:
            return wf.getnframes() / float(wf.getframerate() or 24000)
    except Exception:  # noqa: BLE001
        return 30.0


def _mix_bed(narration: Path, bed: Path, *, volume: float = 0.18) -> Path:
    """Mixe un lit musical sous la narration (durée = narration)."""
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")
    from engines.voice import OUTPUT_DIR

    vol = max(0.02, min(0.5, float(volume)))
    out = OUTPUT_DIR / f"audiobook_mix_{abs(hash(str(narration))) % 10_000_000}.wav"
    dur = _wav_duration_s(narration)
    # bed loopé / tronqué, volume bas, amix durée = narration
    filt = (
        f"[1:a]volume={vol:.3f},afade=t=in:st=0:d=1,"
        f"afade=t=out:st={max(0.5, dur - 2):.2f}:d=2[bg];"
        f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[out]"
    )
    proc = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(narration),
            "-stream_loop",
            "-1",
            "-i",
            str(bed),
            "-filter_complex",
            filt,
            "-map",
            "[out]",
            "-t",
            f"{dur:.3f}",
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
    if proc.returncode != 0 or not out.is_file():
        raise RuntimeError(
            f"Mix lit musique échoué: {(proc.stderr or '')[:300]}"
        )
    return out


def _concat_wavs(paths: list[Path], *, pause_ms: int = 350) -> Path:
    if not paths:
        raise RuntimeError("Aucun chunk audio")
    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    from engines.voice import OUTPUT_DIR

    out = (
        OUTPUT_DIR
        / f"audiobook_{abs(hash(tuple(str(p) for p in paths))) % 10_000_000}.wav"
    )
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
                "anullsrc=r=24000:cl=mono",
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

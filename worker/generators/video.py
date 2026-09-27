"""
Montage vidéo local via ffmpeg.
Télécharge images + audio des scènes, brûle les sous-titres, exporte MP4 vertical.
"""

from __future__ import annotations

import logging
import re
import subprocess
import wave
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger("rehovision-worker.video")

VIDEO_W = 1080
VIDEO_H = 1920


def _escape_ass(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", "\\N")
    )


def _format_ass_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 0
        s += 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def _ffprobe_duration(path: Path) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe échoué: {proc.stderr[:300]}")
    return float(proc.stdout.strip())


def _download(url: str, dest: Path) -> Path:
    log.info("Download → %s", dest.name)
    with requests.get(url, stream=True, timeout=300) as res:
        res.raise_for_status()
        with dest.open("wb") as f:
            for chunk in res.iter_content(chunk_size=1 << 16):
                if chunk:
                    f.write(chunk)
    return dest


def _safe_sub_path(path: Path) -> str:
    # ffmpeg subtitles filter : échapper : et \
    return str(path).replace("\\", "/").replace(":", "\\:")


def _write_ass(path: Path, cues: list[tuple[float, float, str]]) -> None:
    header = f"""[Script Info]
Title: Rehovision
ScriptType: v4.00+
PlayResX: {VIDEO_W}
PlayResY: {VIDEO_H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,60,60,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for start, end, text in cues:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if not cleaned:
            continue
        lines.append(
            f"Dialogue: 0,{_format_ass_time(start)},{_format_ass_time(end)},"
            f"Default,,0,0,0,,{_escape_ass(cleaned)}\n"
        )
    path.write_text("".join(lines), encoding="utf-8")


def assemble_video(
    scenes: list[dict[str, Any]],
    title: str = "",
    output_path: Path | None = None,
) -> Path:
    """
    Assemble images + audio + sous-titres en MP4 vertical 1080x1920.
    """
    if not scenes:
        raise ValueError("Aucune scène à monter")

    out = Path(output_path) if output_path else Path("final.mp4")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = out.parent / "assembly_work"
    work.mkdir(parents=True, exist_ok=True)

    ordered = sorted(scenes, key=lambda s: int(s.get("order") or 0))
    clip_paths: list[Path] = []
    cues: list[tuple[float, float, str]] = []
    timeline = 0.0

    for idx, scene in enumerate(ordered):
        image_url = scene.get("imageUrl")
        audio_url = scene.get("audioUrl")
        if not image_url or not audio_url:
            raise ValueError(
                f"Scène {scene.get('order')} incomplete "
                f"(image={bool(image_url)}, audio={bool(audio_url)})"
            )

        img_path = work / f"scene_{idx:03d}.png"
        aud_path = work / f"scene_{idx:03d}.wav"
        clip_path = work / f"clip_{idx:03d}.mp4"

        _download(str(image_url), img_path)
        _download(str(audio_url), aud_path)

        try:
            duration = float(scene.get("durationSeconds") or 0) or _wav_duration(
                aud_path
            )
        except Exception:
            duration = _ffprobe_duration(aud_path)

        if duration <= 0:
            duration = 1.0

        # Image fixe + audio → clip
        cmd = [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-i",
            str(img_path),
            "-i",
            str(aud_path),
            "-c:v",
            "libx264",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            f"scale={VIDEO_W}:{VIDEO_H}:force_original_aspect_ratio=increase,crop={VIDEO_W}:{VIDEO_H}",
            "-shortest",
            "-movflags",
            "+faststart",
            str(clip_path),
        ]
        log.info("Clip scène %s (%.2fs)", scene.get("order"), duration)
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg clip échoué: {(proc.stderr or '')[-800:]}"
            )

        clip_paths.append(clip_path)
        narration = str(scene.get("narrationText") or "")
        cues.append((timeline, timeline + duration, narration))
        timeline += duration

    # Concat demuxer
    concat_list = work / "concat.txt"
    concat_list.write_text(
        "".join(f"file '{p.resolve()}'\n" for p in clip_paths),
        encoding="utf-8",
    )

    ass_path = work / "subs.ass"
    _write_ass(ass_path, cues)

    concat_raw = work / "concat_raw.mp4"
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_list),
            "-c",
            "copy",
            str(concat_raw),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg concat échoué: {(proc.stderr or '')[-800:]}")

    # Brûler sous-titres
    vf = f"subtitles={_safe_sub_path(ass_path)}"
    proc = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(concat_raw),
            "-vf",
            vf,
            "-c:a",
            "copy",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg subtitles échoué: {(proc.stderr or '')[-800:]}"
        )

    log.info("Vidéo assemblée (%s) → %s (%.1fs)", title or "sans titre", out, timeline)
    return out

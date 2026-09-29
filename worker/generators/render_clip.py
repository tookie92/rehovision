"""
Découpe clip : reframe (smart/fill/fit/split) + captions stylées + B-roll + VO optionnel.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

from generators.broll import (
    broll_enabled,
    composite_broll,
    generate_broll_images,
    resolve_broll_cues,
)
from generators.captions import (
    ass_filter_arg,
    build_cues_for_clip,
    cues_from_caption_text,
    write_viral_ass,
)
from generators.reframe import build_reframe_vf
from generators.viral_polish import apply_viral_polish

log = logging.getLogger("rehovision-worker.render_clip")


def _ffmpeg_cut(
    source_path: Path,
    output_path: Path,
    *,
    start_sec: float,
    duration: float,
    vf: str | None = None,
    filter_complex: str | None = None,
    ass_path: Path | None = None,
) -> None:
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration:.3f}",
    ]

    if filter_complex:
        fc = filter_complex
        map_v = "[vout]"
        if ass_path is not None:
            fc = f"{fc};{map_v}{ass_filter_arg(ass_path)}[vcap]"
            map_v = "[vcap]"
        cmd += ["-filter_complex", fc, "-map", map_v, "-map", "0:a?"]
    else:
        parts = [vf] if vf else []
        if ass_path is not None:
            parts.append(ass_filter_arg(ass_path))
        if not parts:
            raise RuntimeError("Aucun filtre vidéo")
        cmd += ["-vf", ",".join(parts)]

    cmd += [
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
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode}): {proc.stderr[-800:]}"
        )
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("Clip rendu vide")


def _apply_voiceover(
    video_path: Path,
    output_path: Path,
    *,
    text: str,
    mode: str,
    work_dir: Path,
) -> bool:
    mode = (mode or "off").strip().lower()
    if mode in ("", "off", "0", "false"):
        return False
    if not text.strip():
        return False

    try:
        from generators.voiceover import generate_voiceover
    except Exception as e:
        log.warning("Voiceover import KO (%s)", e)
        return False

    wav = work_dir / "clip_vo.wav"
    try:
        generate_voiceover(text.strip()[:800], tone="", output_path=wav)
    except Exception as e:
        log.warning("TTS clip KO (%s)", e)
        return False

    if mode == "replace":
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(wav),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    else:
        # mix
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(wav),
            "-filter_complex",
            "[1:a]volume=0.4[vo];[0:a][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map",
            "0:v:0",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        log.warning("Mix VO échoué: %s", proc.stderr[-400:])
        return False
    return output_path.is_file() and output_path.stat().st_size > 0


def _apply_audio_enhance(
    video_path: Path,
    output_path: Path,
    *,
    mode: str,
) -> bool:
    """Denoise léger + loudnorm pour shorts (−16 LUFS)."""
    mode = (mode or "off").strip().lower()
    if mode in ("", "off", "0", "false"):
        return False
    if mode != "light":
        log.warning("audioEnhance inconnu: %s — ignoré", mode)
        return False

    # highpass + denoise FFT + loudnorm single-pass (assez pour mobile)
    af = (
        "highpass=f=80,"
        "afftdn=nr=10:nf=-25,"
        "loudnorm=I=-16:TP=-1.5:LRA=11"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-af",
        af,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        log.warning("Audio enhance échoué: %s", proc.stderr[-400:])
        return False
    return output_path.is_file() and output_path.stat().st_size > 0


def render_clip(
    source_path: Path,
    output_path: Path,
    *,
    start_sec: float,
    end_sec: float,
    caption_text: str | None = None,
    caption_segments: list[dict[str, Any]] | None = None,
    broll_cues: list[dict[str, Any]] | None = None,
    caption_style: str | None = None,
    layout_mode: str | None = None,
    split_swap: bool = False,
    split_focus_top: dict[str, float] | None = None,
    split_focus_bot: dict[str, float] | None = None,
    voiceover_mode: str | None = None,
    audio_enhance: str | None = None,
    punch_effect: str | None = None,
    look_filter: str | None = None,
    lut_url: str | None = None,
    logo_url: str | None = None,
    logo_corner: str | None = None,
    logo_opacity: float | None = None,
    music_url: str | None = None,
    music_volume: float | None = None,
) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg introuvable dans le PATH")

    duration = max(0.5, float(end_sec) - float(start_sec))
    work = output_path.parent
    work.mkdir(parents=True, exist_ok=True)

    cues: list[tuple[float, float, str]] = []
    if caption_segments:
        cues = build_cues_for_clip(
            caption_segments,
            float(start_sec),
            float(end_sec),
        )
    if not cues and caption_text:
        cues = cues_from_caption_text(caption_text, duration)

    ass_path: Path | None = None
    style_key = (caption_style or "viral").strip().lower()
    if cues and style_key not in ("off", "none", ""):
        ass_path = work / "captions.ass"
        write_viral_ass(ass_path, cues, style_name=caption_style)

    vf, filter_complex = build_reframe_vf(
        source_path,
        float(start_sec),
        float(end_sec),
        work,
        layout_mode=layout_mode,
        split_swap=bool(split_swap),
        split_focus_top=split_focus_top,
        split_focus_bot=split_focus_bot,
    )

    base_path = work / "clip_base.mp4"
    log.info(
        "ffmpeg cut %.1f–%.1f captions=%s layout=%s style=%s",
        start_sec,
        end_sec,
        len(cues),
        layout_mode or "smart",
        caption_style or "viral",
    )

    try:
        _ffmpeg_cut(
            source_path,
            base_path,
            start_sec=float(start_sec),
            duration=duration,
            vf=vf or None,
            filter_complex=filter_complex,
            ass_path=ass_path,
        )
    except RuntimeError:
        if ass_path is not None:
            log.warning("render captions échoué — retry sans captions")
            return render_clip(
                source_path,
                output_path,
                start_sec=start_sec,
                end_sec=end_sec,
                caption_text=None,
                caption_segments=None,
                broll_cues=broll_cues,
                caption_style=caption_style,
                layout_mode=layout_mode,
                split_swap=split_swap,
                voiceover_mode=voiceover_mode,
                audio_enhance=audio_enhance,
                punch_effect=punch_effect,
                look_filter=look_filter,
                lut_url=lut_url,
                logo_url=logo_url,
                logo_corner=logo_corner,
                logo_opacity=logo_opacity,
                music_url=music_url,
                music_volume=music_volume,
            )
        log.warning("reframe échoué — letterbox")
        _ffmpeg_cut(
            source_path,
            base_path,
            start_sec=float(start_sec),
            duration=duration,
            vf=(
                "scale=1080:1920:force_original_aspect_ratio=decrease,"
                "pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
            ),
            ass_path=None,
        )

    current = base_path

    if broll_enabled():
        try:
            resolved = resolve_broll_cues(
                clip_duration=duration,
                caption_text=caption_text,
                caption_segments=caption_segments,
                payload_cues=broll_cues,
            )
            shots = generate_broll_images(resolved, work)
            if shots:
                broll_out = work / "clip_broll.mp4"
                composite_broll(current, broll_out, shots)
                current = broll_out
                log.info("B-roll ×%d appliqué", len(shots))
        except Exception as e:
            log.warning("B-roll ignoré (%s)", e)

    # Pack viral : punch → look/LUT → logo → (après VO) musique
    current = apply_viral_polish(
        current,
        work,
        punch_effect=punch_effect,
        look_filter=look_filter,
        lut_url=lut_url,
        logo_url=logo_url,
        logo_corner=logo_corner,
        logo_opacity=logo_opacity,
        music_url=None,  # musique après VO
        music_volume=None,
    )

    vo_mode = (voiceover_mode or "off").strip().lower()
    if vo_mode not in ("", "off"):
        vo_out = work / "clip_vo.mp4"
        ok = _apply_voiceover(
            current,
            vo_out,
            text=caption_text or "",
            mode=vo_mode,
            work_dir=work,
        )
        if ok:
            current = vo_out
            log.info("Voiceover mode=%s appliqué", vo_mode)

    if music_url and str(music_url).strip():
        current = apply_viral_polish(
            current,
            work,
            punch_effect="off",
            logo_url=None,
            music_url=music_url,
            music_volume=music_volume,
        )

    ae_mode = (audio_enhance or "off").strip().lower()
    if ae_mode not in ("", "off"):
        ae_out = work / "clip_audio.mp4"
        ok = _apply_audio_enhance(current, ae_out, mode=ae_mode)
        if ok:
            current = ae_out
            log.info("Audio enhance mode=%s appliqué", ae_mode)

    shutil.copy2(current, output_path)
    return output_path

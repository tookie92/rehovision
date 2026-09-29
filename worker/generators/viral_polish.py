"""
Pack viral léger : watermark logo, bed musique (ducking), effets punch.
Presets ffmpeg — pas une timeline.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from urllib.request import urlretrieve

log = logging.getLogger("rehovision-worker.viral")

LOGO_CORNERS = {
    "tl": "20:20",
    "tr": "W-w-20:20",
    "bl": "20:H-h-20",
    "br": "W-w-20:H-h-20",
}


def _run(cmd: list[str], label: str) -> bool:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        log.warning("%s échoué: %s", label, proc.stderr[-500:])
        return False
    return True


def _download(url: str, dest: Path) -> Path | None:
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        urlretrieve(url, dest)
        if dest.is_file() and dest.stat().st_size > 0:
            return dest
    except Exception as e:
        log.warning("Download KO %s: %s", url[:80], e)
    return None


def apply_punch_effect(
    video_path: Path,
    output_path: Path,
    *,
    effect: str,
) -> bool:
    """zoom | flash | grain — off = no-op."""
    effect = (effect or "off").strip().lower()
    if effect in ("", "off", "none"):
        return False

    if effect == "zoom":
        # Crop légèrement zoomé (effet punch / tight frame)
        vf = (
            "scale=1242:2208,"
            "crop=1080:1920:(iw-1080)/2:(ih-1920)/2,"
            "fade=t=in:st=0:d=0.08"
        )
    elif effect == "flash":
        vf = "fade=t=in:st=0:d=0.15:color=white,eq=contrast=1.06:saturation=1.05"
    elif effect == "grain":
        vf = "noise=alls=14:allf=t+u,eq=contrast=1.06:saturation=1.1"
    else:
        log.warning("punchEffect inconnu: %s", effect)
        return False

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    ok = _run(cmd, f"punch:{effect}")
    return ok and output_path.is_file()


def apply_watermark(
    video_path: Path,
    output_path: Path,
    *,
    logo_url: str,
    work_dir: Path,
    corner: str = "br",
    opacity: float = 0.85,
) -> bool:
    if not logo_url.strip():
        return False
    ext = Path(logo_url.split("?")[0]).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        ext = ".png"
    logo = _download(logo_url.strip(), work_dir / f"logo{ext}")
    if not logo:
        return False

    opacity = max(0.1, min(1.0, float(opacity)))
    pos = LOGO_CORNERS.get((corner or "br").lower(), LOGO_CORNERS["br"])

    # Scale logo ~12% largeur frame, overlay coin
    fc = (
        f"[1:v]scale=130:-1,format=rgba,colorchannelmixer=aa={opacity:.2f}[lg];"
        f"[0:v][lg]overlay={pos}:format=auto[vout]"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(logo),
        "-filter_complex",
        fc,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-shortest",
        str(output_path),
    ]
    ok = _run(cmd, "watermark")
    return ok and output_path.is_file()


def apply_music_bed(
    video_path: Path,
    output_path: Path,
    *,
    music_url: str,
    work_dir: Path,
    volume: float = 0.18,
) -> bool:
    """Mix musique sous la parole avec ducking (sidechain)."""
    if not music_url.strip():
        return False
    mext = Path(music_url.split("?")[0]).suffix.lower()
    if mext not in {".mp3", ".wav", ".m4a", ".aac", ".ogg"}:
        mext = ".mp3"
    music = _download(music_url.strip(), work_dir / f"bed{mext}")
    if not music:
        return False

    vol = max(0.02, min(0.6, float(volume)))
    # sidechaincompress : musique baisse quand la voix parle
    fc = (
        f"[1:a]volume={vol:.3f},aloop=loop=-1:size=2e+09,aformat=fltp[bed];"
        f"[0:a]asplit=2[voice][sc];"
        f"[bed][sc]sidechaincompress=threshold=0.08:ratio=6:attack=50:release=400[ducked];"
        f"[voice][ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(music),
        "-filter_complex",
        fc,
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
        "-shortest",
        str(output_path),
    ]
    ok = _run(cmd, "music-bed")
    if ok and output_path.is_file():
        return True

    # Fallback sans sidechain (amix simple)
    log.info("Retry musique sans sidechain")
    fc2 = (
        f"[1:a]volume={vol:.3f},aloop=loop=-1:size=2e+09[bed];"
        f"[0:a][bed]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    )
    cmd[cmd.index(fc)] = fc2
    # rebuild cmd cleanly
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(music),
        "-filter_complex",
        fc2,
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
        "-shortest",
        str(output_path),
    ]
    ok = _run(cmd, "music-bed-simple")
    return ok and output_path.is_file()


def apply_look_filter(
    video_path: Path,
    output_path: Path,
    *,
    look: str,
) -> bool:
    """warm | cool | contrast | soft_grain — presets eq/noise, pas de .cube."""
    look = (look or "off").strip().lower()
    if look in ("", "off", "none"):
        return False

    if look == "warm":
        vf = "eq=contrast=1.05:saturation=1.12:gamma_r=1.06:gamma_b=0.94"
    elif look == "cool":
        vf = "eq=contrast=1.04:saturation=1.05:gamma_r=0.94:gamma_b=1.08"
    elif look == "contrast":
        vf = "eq=contrast=1.18:brightness=0.02:saturation=1.08"
    elif look == "soft_grain":
        vf = "noise=alls=8:allf=t+u,eq=contrast=1.04:saturation=0.98"
    else:
        log.warning("lookFilter inconnu: %s", look)
        return False

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    ok = _run(cmd, f"look:{look}")
    return ok and output_path.is_file()


def apply_viral_polish(
    video_path: Path,
    work_dir: Path,
    *,
    punch_effect: str | None = None,
    look_filter: str | None = None,
    logo_url: str | None = None,
    logo_corner: str | None = None,
    logo_opacity: float | None = None,
    music_url: str | None = None,
    music_volume: float | None = None,
) -> Path:
    """Enchaîne punch → look → logo → musique. Retourne le path courant."""
    current = video_path

    pe = (punch_effect or "off").strip().lower()
    if pe not in ("", "off", "none"):
        out = work_dir / "clip_punch.mp4"
        if apply_punch_effect(current, out, effect=pe):
            current = out
            log.info("Punch effect=%s", pe)

    lf = (look_filter or "off").strip().lower()
    if lf not in ("", "off", "none"):
        out = work_dir / "clip_look.mp4"
        if apply_look_filter(current, out, look=lf):
            current = out
            log.info("Look filter=%s", lf)

    if logo_url and logo_url.strip():
        out = work_dir / "clip_logo.mp4"
        if apply_watermark(
            current,
            out,
            logo_url=logo_url,
            work_dir=work_dir,
            corner=logo_corner or "br",
            opacity=logo_opacity if logo_opacity is not None else 0.85,
        ):
            current = out
            log.info("Logo watermark appliqué")

    if music_url and music_url.strip():
        out = work_dir / "clip_music.mp4"
        if apply_music_bed(
            current,
            out,
            music_url=music_url,
            work_dir=work_dir,
            volume=music_volume if music_volume is not None else 0.18,
        ):
            current = out
            log.info("Music bed appliqué")

    return current

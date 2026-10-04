"""
Polish Reel via HyperFrames (HTML → MP4) — captions compactes + titre léger.
La découpe / crop 9:16 reste ffmpeg ; HF ne fait que la finition overlays.
"""
from __future__ import annotations

import html
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from engines.edit import ffprobe_duration
from engines.export_reel import TARGET_H, TARGET_W, _compact_cues
from engines.stt import transcribe_cues

log = logging.getLogger("engines.hyperframes_polish")

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "outputs" / "clips"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
HF_RUNNER = ROOT / "tools" / "hyperframes-runner"
HF_CLI = HF_RUNNER / "node_modules" / ".bin" / "hyperframes"

ProgressCb = Callable[[int, str], None]


def render_hyperframes_polish(
    *,
    source_path: Path,
    title: str | None = None,
    captions: bool = True,
    language: str | None = None,
    on_progress: ProgressCb | None = None,
) -> tuple[Path, dict[str, Any]]:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    node = _resolve_node()
    if not HF_CLI.is_file():
        raise RuntimeError(
            "HyperFrames non installé — npm install dans worker/tools/hyperframes-runner"
        )

    ffmpeg = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg introuvable")

    prog(8, "Crop 9:16 (ffmpeg)")
    with tempfile.TemporaryDirectory(prefix="rehovision_hf_") as tmp:
        tdir = Path(tmp)
        base_916 = tdir / "base_916.mp4"
        _ffmpeg_916(ffmpeg, source_path, base_916)

        cues: list[dict[str, Any]] = []
        if captions:
            prog(22, "Transcription Whisper…")
            try:
                cues = _compact_cues(transcribe_cues(base_916, language=language))
            except Exception as exc:  # noqa: BLE001
                log.warning("Captions HF ignorées: %s", exc)
                cues = []

        duration = ffprobe_duration(base_916)
        proj = tdir / "project"
        proj.mkdir()
        shutil.copy2(base_916, proj / "source.mp4")
        (proj / "index.html").write_text(
            _build_index_html(
                duration=duration,
                cues=cues,
                title=(title or "").strip()[:80] or None,
            ),
            encoding="utf-8",
        )

        out = (
            OUTPUT_DIR
            / f"clip_hf_{abs(hash(str(source_path) + str(title))) % 10_000_000}.mp4"
        )
        prog(40, f"HyperFrames render ({len(cues)} captions)…")
        cmd = [
            node,
            str(HF_CLI),
            "render",
            str(proj),
            "-o",
            str(out),
            "-q",
            "draft",
            "--fps",
            "30",
            "--quiet",
            "--best-effort",
        ]
        env = os.environ.copy()
        env["PATH"] = f"{Path(node).parent}:{env.get('PATH', '')}"
        try:
            subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                env=env,
                timeout=int(os.environ.get("HYPERFRAMES_TIMEOUT_S", "600")),
            )
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or exc.stdout or str(exc))[-1200:]
            raise RuntimeError(f"HyperFrames render échoué: {err}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("HyperFrames render timeout") from exc

        if not out.is_file() or out.stat().st_size < 1000:
            raise RuntimeError("HyperFrames: sortie manquante")

        prog(95, "Polish HyperFrames prêt")
        meta = {
            "aspect": "9:16",
            "width": TARGET_W,
            "height": TARGET_H,
            "captions": bool(cues),
            "cueCount": len(cues),
            "captionStyle": "hyperframes-v1",
            "engine": "hyperframes",
            "title": (title or "").strip()[:80] or None,
        }
        return out, meta


def _ffmpeg_916(ffmpeg: str, src: Path, dest: Path) -> None:
    vf = (
        f"scale={TARGET_W}:{TARGET_H}:force_original_aspect_ratio=increase,"
        f"crop={TARGET_W}:{TARGET_H},setsar=1"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        str(dest),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _build_index_html(
    *,
    duration: float,
    cues: list[dict[str, Any]],
    title: str | None,
) -> str:
    dur = max(0.5, float(duration))
    parts: list[str] = [
        "<!DOCTYPE html>",
        "<html><head><meta charset=\"utf-8\" />",
        "<style>",
        "html,body{margin:0;background:#000}",
        "#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:#000}",
        "video.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
        ".caption{position:absolute;left:72px;right:72px;bottom:240px;text-align:center;",
        "font-family:Inter,Arial,sans-serif;font-weight:800;font-size:48px;line-height:1.12;",
        "color:#fff;letter-spacing:-0.02em;",
        "text-shadow:0 2px 0 rgba(0,0,0,.85),0 8px 28px rgba(0,0,0,.45)}",
        ".title{position:absolute;left:64px;right:64px;top:110px;text-align:center;",
        "font-family:Inter,Arial,sans-serif;font-weight:700;font-size:34px;color:#fff;",
        "text-shadow:0 2px 14px rgba(0,0,0,.65)}",
        "</style></head><body>",
        (
            f'<div id="stage" data-composition-id="reel" data-start="0" '
            f'data-duration="{dur:.3f}" data-width="1080" data-height="1920" '
            f'data-fps="30" data-no-timeline>'
        ),
        (
            f'<video class="clip" data-start="0" data-duration="{dur:.3f}" '
            f'data-track-index="0" src="source.mp4" playsinline></video>'
        ),
    ]
    track = 1
    if title:
        t_dur = min(1.6, max(0.8, dur * 0.25))
        parts.append(
            f'<div class="clip title" data-start="0" data-duration="{t_dur:.3f}" '
            f'data-track-index="{track}">{html.escape(title)}</div>'
        )
        track += 1
    for cue in cues:
        start = max(0.0, float(cue["start"]))
        end = max(start + 0.35, float(cue["end"]))
        if start >= dur:
            continue
        end = min(end, dur)
        c_dur = max(0.35, end - start)
        text = html.escape(str(cue["text"]))
        parts.append(
            f'<div class="clip caption" data-start="{start:.3f}" '
            f'data-duration="{c_dur:.3f}" data-track-index="{track}">{text}</div>'
        )
        track += 1
    parts.append("</div></body></html>")
    return "\n".join(parts)


def _resolve_node() -> str:
    env = (os.environ.get("HYPERFRAMES_NODE") or "").strip()
    if env and Path(env).is_file():
        return env
    node = shutil.which("node")
    if node and _node_major(node) >= 22:
        return node
    # Cursor-agent Node 24 fallback
    versions = Path.home() / ".local/share/cursor-agent/versions"
    if versions.is_dir():
        candidates = sorted(versions.glob("*/node"), reverse=True)
        for c in candidates:
            if c.is_file() and _node_major(str(c)) >= 22:
                return str(c)
    raise RuntimeError(
        "Node.js >= 22 requis pour HyperFrames — définir HYPERFRAMES_NODE"
    )


def _node_major(node_bin: str) -> int:
    try:
        out = subprocess.check_output(
            [node_bin, "-p", "process.versions.node.split('.')[0]"],
            text=True,
            timeout=5,
        ).strip()
        return int(out)
    except Exception:  # noqa: BLE001
        return 0

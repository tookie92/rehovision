"""
Polish Reel via HyperFrames (HTML → MP4).

- caption_style=static : phrases compactes
- caption_style=karaoke : mots horodatés, highlight type karaoke (GSAP)
"""
from __future__ import annotations

import html
import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from engines.edit import ffprobe_duration
from engines.export_reel import TARGET_H, TARGET_W, _compact_cues
from engines.stt import transcribe_cues, transcribe_words

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
    caption_style: str = "karaoke",
    language: str | None = None,
    on_progress: ProgressCb | None = None,
) -> tuple[Path, dict[str, Any]]:
    def prog(p: int, msg: str) -> None:
        log.info("[%d%%] %s", p, msg)
        if on_progress:
            on_progress(p, msg)

    style = (caption_style or "karaoke").strip().lower()
    if style in ("kinetic", "karaoke-hf", "pill"):
        style = "karaoke"
    if style not in ("karaoke", "static"):
        style = "karaoke"

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
        words: list[dict[str, Any]] = []
        if captions:
            prog(22, "Transcription Whisper…")
            try:
                if style == "karaoke":
                    words = transcribe_words(base_916, language=language)
                    if not words:
                        cues = _compact_cues(
                            transcribe_cues(base_916, language=language)
                        )
                        style = "static"
                else:
                    cues = _compact_cues(
                        transcribe_cues(base_916, language=language)
                    )
            except Exception as exc:  # noqa: BLE001
                log.warning("Captions HF ignorées: %s", exc)
                cues, words = [], []

        duration = ffprobe_duration(base_916)
        proj = tdir / "project"
        proj.mkdir()
        shutil.copy2(base_916, proj / "source.mp4")
        title_s = (title or "").strip()[:80] or None
        if style == "karaoke" and words:
            html_doc = _build_karaoke_html(
                duration=duration,
                words=words,
                title=title_s,
            )
            cue_count = len(words)
        else:
            html_doc = _build_static_html(
                duration=duration,
                cues=cues,
                title=title_s,
            )
            cue_count = len(cues)
            style = "static"

        (proj / "index.html").write_text(html_doc, encoding="utf-8")

        out = (
            OUTPUT_DIR
            / f"clip_hf_{abs(hash(str(source_path) + style + str(title_s))) % 10_000_000}.mp4"
        )
        prog(40, f"HyperFrames render ({style}, {cue_count})…")
        workers = os.environ.get("HYPERFRAMES_WORKERS", "2").strip() or "2"
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
            "--workers",
            workers,
            "--quiet",
            "--best-effort",
        ]
        env = os.environ.copy()
        env["PATH"] = f"{Path(node).parent}:{env.get('PATH', '')}"
        # Cap V8 heap for multi-worker Chrome capture
        if "max-old-space-size" not in env.get("NODE_OPTIONS", ""):
            env["NODE_OPTIONS"] = (
                (env.get("NODE_OPTIONS", "") + " --max-old-space-size=8192").strip()
            )
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
            "captions": cue_count > 0,
            "cueCount": cue_count,
            "captionStyle": f"hyperframes-{style}",
            "engine": "hyperframes",
            "title": title_s,
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
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-g",
        "30",
        "-keyint_min",
        "30",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
        str(dest),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _build_static_html(
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


def _build_karaoke_html(
    *,
    duration: float,
    words: list[dict[str, Any]],
    title: str | None,
) -> str:
    """Composition 9:16 + karaoke pill (GSAP), inspiré caption-pill-karaoke."""
    dur = max(0.5, float(duration))
    clean_words: list[dict[str, Any]] = []
    for w in words:
        text = str(w.get("text") or "").strip()
        if not text:
            continue
        start = max(0.0, float(w["start"]))
        end = min(dur, max(start + 0.08, float(w["end"])))
        if start >= dur:
            continue
        clean_words.append({"text": text, "start": start, "end": end})

    words_json = json.dumps(clean_words, ensure_ascii=False)
    title_json = json.dumps(title or "", ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<style>
  html, body {{ margin: 0; background: #000; overflow: hidden; }}
  #stage {{
    position: relative; width: 1080px; height: 1920px;
    overflow: hidden; background: #000;
  }}
  video.clip {{
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover;
  }}
  .title-banner {{
    position: absolute; left: 64px; right: 64px; top: 110px;
    text-align: center; font-family: Inter, Arial, sans-serif;
    font-weight: 700; font-size: 34px; color: #fff;
    text-shadow: 0 2px 14px rgba(0,0,0,.65);
    opacity: 0; pointer-events: none; z-index: 30;
  }}
  #caption-stage {{
    position: absolute; inset: 0; z-index: 20; pointer-events: none;
  }}
  .caption-group {{
    position: absolute; left: 40px; right: 40px; bottom: 220px;
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
  }}
  .caption-pill {{
    max-width: 960px; padding: 16px 36px 18px;
    border-radius: 22px; background: rgba(18,18,20,.82);
    box-shadow: 0 8px 28px rgba(0,0,0,.35);
    text-align: center;
  }}
  .caption-copy {{
    display: flex; flex-direction: column; align-items: center;
    color: #8a8a8e; font-family: Inter, Arial, sans-serif;
    font-size: 48px; font-weight: 800; line-height: 1.15;
    letter-spacing: -0.02em;
  }}
  .caption-line {{
    display: flex; justify-content: center; flex-wrap: wrap;
    gap: 12px; max-width: 900px;
  }}
  .caption-word {{
    display: inline-block; color: #8a8a8e;
    text-shadow: 0 2px 0 rgba(0,0,0,.35);
  }}
  .caption-word.is-active {{
    color: #ffffff;
  }}
</style>
</head>
<body>
<div id="stage"
  data-composition-id="reel"
  data-start="0"
  data-duration="{dur:.3f}"
  data-width="1080"
  data-height="1920"
  data-fps="30">
  <video class="clip" data-start="0" data-duration="{dur:.3f}"
    data-track-index="0" src="source.mp4" playsinline></video>
  <div id="titleBanner" class="title-banner"></div>
  <div id="caption-stage"></div>
</div>
<script>
(function () {{
  var DURATION = {dur:.3f};
  var WORDS = {words_json};
  var TITLE = {title_json};
  var MAX_WORDS = 4;
  var COLOR_INACTIVE = "#8A8A8E";
  var COLOR_ACTIVE = "#FFFFFF";
  var COLOR_EMPHASIS = "#F5D76E";
  var GROUP_END_BUFFER = 0.28;
  var COLOR_FADE = 0.08;
  var WORD_LEAD = 0.04;

  function normalize(words) {{
    return words.map(function (w) {{
      return {{
        text: String(w.text || "").trim(),
        start: Math.max(0, Number(w.start) || 0),
        end: Math.min(DURATION, Math.max(Number(w.start) || 0, Number(w.end) || 0)),
      }};
    }}).filter(function (w) {{ return w.text.length > 0; }});
  }}

  function makeGroups(words) {{
    var groups = [];
    var cur = [];
    words.forEach(function (word, i) {{
      cur.push(word);
      var next = words[i + 1];
      var punct = /[,.:!?…]$/.test(word.text);
      var pause = next ? next.start - word.end : 99;
      if (cur.length >= MAX_WORDS || punct || pause >= 0.18 || !next) {{
        groups.push({{
          words: cur.slice(),
          start: cur[0].start,
          end: cur[cur.length - 1].end,
        }});
        cur = [];
      }}
    }});
    if (cur.length) {{
      groups.push({{
        words: cur.slice(),
        start: cur[0].start,
        end: cur[cur.length - 1].end,
      }});
    }}
    return groups;
  }}

  function build(groups) {{
    var stage = document.getElementById("caption-stage");
    groups.forEach(function (group, gi) {{
      var groupEl = document.createElement("div");
      groupEl.className = "caption-group";
      groupEl.id = "caption-group-" + gi;
      var pill = document.createElement("div");
      pill.className = "caption-pill";
      var copy = document.createElement("div");
      copy.className = "caption-copy";
      var line = document.createElement("div");
      line.className = "caption-line";
      group.words.forEach(function (word, wi) {{
        var el = document.createElement("span");
        el.className = "caption-word";
        el.id = "caption-word-" + gi + "-" + wi;
        el.textContent = word.text;
        line.appendChild(el);
      }});
      copy.appendChild(line);
      pill.appendChild(copy);
      groupEl.appendChild(pill);
      stage.appendChild(groupEl);
    }});
  }}

  var groups = makeGroups(normalize(WORDS));
  build(groups);

  var titleEl = document.getElementById("titleBanner");
  if (TITLE) {{
    titleEl.textContent = TITLE;
  }}

  window.__timelines = window.__timelines || {{}};
  var tl = gsap.timeline({{ paused: true }});

  if (TITLE) {{
    var tDur = Math.min(1.5, Math.max(0.8, DURATION * 0.22));
    tl.set(titleEl, {{ opacity: 1 }}, 0);
    tl.to(titleEl, {{ opacity: 0, duration: 0.25 }}, tDur);
  }}

  groups.forEach(function (group, gi) {{
    var groupEl = document.getElementById("caption-group-" + gi);
    var next = groups[gi + 1];
    var visibleStart = Math.max(0, group.start);
    var visibleEnd = next
      ? Math.min(next.start, group.end + GROUP_END_BUFFER)
      : Math.min(DURATION, group.end + GROUP_END_BUFFER);
    visibleEnd = Math.max(visibleStart + 0.05, visibleEnd);

    tl.set(groupEl, {{ opacity: 1 }}, visibleStart);
    tl.set(groupEl, {{ opacity: 0 }}, visibleEnd);

    group.words.forEach(function (word, wi) {{
      var el = document.getElementById("caption-word-" + gi + "-" + wi);
      var isFirst = wi === 0;
      var activeColor = /[!?]$/.test(word.text) ? COLOR_EMPHASIS : COLOR_ACTIVE;
      tl.set(el, {{ color: isFirst ? activeColor : COLOR_INACTIVE }}, visibleStart);
      if (isFirst) {{
        tl.set(el, {{ scale: 1.06 }}, visibleStart);
        tl.to(el, {{ scale: 1, duration: 0.12, ease: "power2.out" }}, visibleStart);
        return;
      }}
      var at = Math.max(visibleStart, word.start - WORD_LEAD);
      tl.to(el, {{ color: activeColor, duration: COLOR_FADE, ease: "none" }}, at);
      tl.fromTo(
        el,
        {{ scale: 1 }},
        {{ scale: 1.08, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out" }},
        at
      );
    }});
  }});

  window.__timelines.reel = tl;
}})();
</script>
</body>
</html>
"""


def _resolve_node() -> str:
    env = (os.environ.get("HYPERFRAMES_NODE") or "").strip()
    if env and Path(env).is_file():
        return env
    node = shutil.which("node")
    if node and _node_major(node) >= 22:
        return node
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

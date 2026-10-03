"""
Reframe 9:16 intelligent : suit le visage / sujet (OpenCV Haar).

Mode smart (défaut) : tracking dense → crop par segments (~1s) concatenés
(pas un seul crop moyen pour tout le clip — écart Opus-like).
Fallback : crop centré (plein cadre) plutôt que letterbox.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np

log = logging.getLogger("rehovision-worker.reframe")

OUT_W = 1080
OUT_H = 1920
TARGET_ASPECT = OUT_W / OUT_H  # 0.5625


def _ffprobe_size(path: Path) -> tuple[int, int]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr[-400:]}")
    raw = (proc.stdout or "").strip().split("x")
    if len(raw) != 2:
        raise RuntimeError(f"ffprobe size invalide: {proc.stdout!r}")
    return int(raw[0]), int(raw[1])


def _extract_frame(source: Path, time_sec: float, dest: Path) -> bool:
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{time_sec:.3f}",
        "-i",
        str(source),
        "-frames:v",
        "1",
        "-q:v",
        "3",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode == 0 and dest.is_file() and dest.stat().st_size > 0


_cascade = None


def _get_cascade():
    global _cascade
    if _cascade is not None:
        return _cascade
    import cv2

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        raise RuntimeError("Haar cascade introuvable")
    _cascade = cascade
    return _cascade


def _detect_face_center(image_path: Path) -> tuple[float, float, float] | None:
    """
    Retourne (cx_norm, cy_norm, area_norm) dans [0,1], ou None.
    Préfère le plus grand visage.
    """
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        return None
    h, w = img.shape[:2]
    if w < 2 or h < 2:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _get_cascade().detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=3,
        minSize=(max(20, w // 50), max(20, h // 50)),
    )
    if len(faces) == 0:
        # Fallback cascade (lunettes / angle léger)
        alt_path = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
        alt = cv2.CascadeClassifier(alt_path)
        if not alt.empty():
            faces = alt.detectMultiScale(
                gray,
                scaleFactor=1.08,
                minNeighbors=3,
                minSize=(max(20, w // 50), max(20, h // 50)),
            )
    if len(faces) == 0:
        return None
    # Plus grande face
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    cx = (x + fw / 2) / w
    # Bias légèrement vers le haut du visage (meilleur cadrage talking-head)
    cy = (y + fh * 0.35) / h
    area = (fw * fh) / (w * h)
    return float(cx), float(cy), float(area)


def _sample_face_track(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
) -> list[tuple[float, float, float]]:
    """
    Track dense : [(t_abs, cx, cy), ...] lissé EMA.
    fps d’échantillonnage via REFRAME_TRACK_FPS (défaut 2.5 ≈ toutes les 0.4s).
    """
    duration = max(0.2, float(end_sec) - float(start_sec))
    fps = float(os.getenv("REFRAME_TRACK_FPS", "2.5"))
    fps = max(1.0, min(8.0, fps))
    # Cap samples pour clips longs (30s @ 2.5fps ≈ 75)
    max_n = max(8, int(os.getenv("REFRAME_TRACK_MAX", "80")))
    n = min(max_n, max(6, int(round(duration * fps))))

    frames_dir = work_dir / "reframe_track"
    if frames_dir.exists():
        shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Une passe ffmpeg (beaucoup plus rapide que N -ss)
    pattern = str(frames_dir / "f_%04d.jpg")
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{float(start_sec):.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration:.3f}",
        "-vf",
        f"fps={fps:.3f}",
        "-q:v",
        "5",
        pattern,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    files = sorted(frames_dir.glob("f_*.jpg"))
    if proc.returncode != 0 or not files:
        log.warning(
            "Track extract failed (%s) — fallback per-frame",
            (proc.stderr or "")[-200:],
        )
        files = []
        times = np.linspace(start_sec, end_sec, n)
        for i, t in enumerate(times):
            fp = frames_dir / f"f_{i:04d}.jpg"
            if _extract_frame(source_path, float(t), fp):
                files.append(fp)

    raw: list[tuple[float, float, float] | None] = []
    for i, fp in enumerate(files):
        t = float(start_sec) + (i / max(fps, 0.01))
        t = min(t, float(end_sec))
        hit = _detect_face_center(fp)
        if hit is None:
            raw.append(None)
        else:
            cx, cy, _area = hit
            raw.append((t, cx, cy))

    shutil.rmtree(frames_dir, ignore_errors=True)

    # Forward-fill + EMA
    alpha = float(os.getenv("REFRAME_EMA", "0.45"))
    alpha = max(0.15, min(0.9, alpha))
    track: list[tuple[float, float, float]] = []
    prev: tuple[float, float] | None = None
    for item in raw:
        if item is None:
            if prev is None:
                continue
            # hold last position (visage temporairement perdu)
            t_hold = track[-1][0] + (1.0 / fps) if track else float(start_sec)
            track.append((t_hold, prev[0], prev[1]))
            continue
        t, cx, cy = item
        if prev is None:
            prev = (cx, cy)
        else:
            prev = (
                alpha * cx + (1 - alpha) * prev[0],
                alpha * cy + (1 - alpha) * prev[1],
            )
        cx_s = min(0.92, max(0.08, prev[0]))
        cy_s = min(0.75, max(0.18, prev[1]))
        track.append((t, cx_s, cy_s))
        prev = (cx_s, cy_s)

    return track


def estimate_subject_center(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
) -> tuple[float, float]:
    """
    Centre sujet moyen (compat smart_focus / fill).
    """
    track = _sample_face_track(source_path, start_sec, end_sec, work_dir)
    if not track:
        log.info("Aucun visage détecté — crop centré")
        return 0.5, 0.42
    cx = float(np.median([p[1] for p in track]))
    cy = float(np.median([p[2] for p in track]))
    cx = min(0.92, max(0.08, cx))
    cy = min(0.75, max(0.2, cy))
    log.info(
        "Reframe sujet médian cx=%.2f cy=%.2f (%d samples)",
        cx,
        cy,
        len(track),
    )
    return cx, cy


def _build_tracking_segments(
    track: list[tuple[float, float, float]],
    start_sec: float,
    end_sec: float,
) -> list[tuple[float, float, float, float]]:
    """
    Agrège le track en segments (rel_start, rel_end, cx, cy).
    """
    duration = max(0.2, float(end_sec) - float(start_sec))
    seg_len = float(os.getenv("REFRAME_SEGMENT_SEC", "1.0"))
    seg_len = max(0.5, min(3.0, seg_len))
    # Deadzone : ne bouge le crop que si le visage bouge assez (anti-jitter)
    dead = float(os.getenv("REFRAME_DEADZONE", "0.035"))

    segments: list[tuple[float, float, float, float]] = []
    t_cursor = 0.0
    last_cx, last_cy = 0.5, 0.42
    while t_cursor < duration - 0.05:
        t1 = min(duration, t_cursor + seg_len)
        abs0 = start_sec + t_cursor
        abs1 = start_sec + t1
        pts = [p for p in track if abs0 - 0.05 <= p[0] <= abs1 + 0.05]
        if pts:
            cx = float(np.median([p[1] for p in pts]))
            cy = float(np.median([p[2] for p in pts]))
        else:
            cx, cy = last_cx, last_cy
        if abs(cx - last_cx) < dead and abs(cy - last_cy) < dead and segments:
            cx, cy = last_cx, last_cy
        else:
            last_cx, last_cy = cx, cy
        segments.append((t_cursor, t1, cx, cy))
        t_cursor = t1

    if not segments:
        segments.append((0.0, duration, 0.5, 0.42))
    # Assure couverture jusqu’à la fin
    if segments[-1][1] < duration - 0.01:
        _a, _b, cx, cy = segments[-1]
        segments.append((segments[-1][1], duration, cx, cy))
    return segments


def build_smart_tracking_filter(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
    *,
    zoom: float = 1.0,
) -> str | None:
    """
    filter_complex : trim+crop par segment + concat → [vout].
    None si tracking inutilisable (caller fallback crop fixe).
    """
    track = _sample_face_track(source_path, start_sec, end_sec, work_dir)
    if len(track) < 3:
        return None

    width, height = _ffprobe_size(source_path)
    duration = max(0.2, float(end_sec) - float(start_sec))
    segments = _build_tracking_segments(track, start_sec, end_sec)
    # Si tous les crops sont identiques → pas besoin de concat
    boxes = [
        compute_crop_box_zoomed(width, height, cx, cy, zoom)
        for _a, _b, cx, cy in segments
    ]
    if len({b for b in boxes}) <= 1:
        return None

    parts: list[str] = []
    labels: list[str] = []
    for i, ((rel0, rel1, cx, cy), (cw, ch, x, y)) in enumerate(
        zip(segments, boxes)
    ):
        # trim relatif au clip déjà -ss'd dans ffmpeg cut… NON :
        # render_clip fait -ss start puis -t duration sur la source.
        # Donc t=0 dans le filtre = début du clip.
        dur = max(0.05, rel1 - rel0)
        lab = f"v{i}"
        parts.append(
            f"[0:v]trim=start={rel0:.3f}:duration={dur:.3f},setpts=PTS-STARTPTS,"
            f"crop={cw}:{ch}:{x}:{y},scale={OUT_W}:{OUT_H}[{lab}]"
        )
        labels.append(f"[{lab}]")

    n = len(labels)
    if n == 1:
        parts.append(f"{labels[0]}null[vout]")
    else:
        parts.append(f"{''.join(labels)}concat=n={n}:v=1:a=0[vout]")

    log.info(
        "Smart track: %d samples → %d segments (%.1fs clip)",
        len(track),
        n,
        duration,
    )
    return ";".join(parts)


def compute_crop_box(
    width: int,
    height: int,
    cx_norm: float,
    cy_norm: float,
) -> tuple[int, int, int, int]:
    """
    Boîte de crop (w, h, x, y) en pixels source pour aspect 9:16.
    """
    src_aspect = width / height
    if src_aspect >= TARGET_ASPECT:
        # Trop large → crop horizontal
        crop_h = height
        crop_w = int(round(height * TARGET_ASPECT))
        crop_w = min(crop_w, width)
        cx = cx_norm * width
        x = int(round(cx - crop_w / 2))
        x = max(0, min(x, width - crop_w))
        y = 0
    else:
        # Trop haut → crop vertical
        crop_w = width
        crop_h = int(round(width / TARGET_ASPECT))
        crop_h = min(crop_h, height)
        cy = cy_norm * height
        y = int(round(cy - crop_h / 2))
        y = max(0, min(y, height - crop_h))
        x = 0

    crop_w = max(2, crop_w - (crop_w % 2))
    crop_h = max(2, crop_h - (crop_h % 2))
    x = max(0, min(x, width - crop_w))
    y = max(0, min(y, height - crop_h))
    return crop_w, crop_h, x, y


def _detect_faces_on_frame(image_path: Path) -> list[tuple[float, float, float]]:
    """Liste (cx, cy, area) normalisés, triée par aire desc."""
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        return []
    h, w = img.shape[:2]
    if w < 2 or h < 2:
        return []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _get_cascade().detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(max(24, w // 40), max(24, h // 40)),
    )
    out: list[tuple[float, float, float]] = []
    for x, y, fw, fh in faces:
        cx = (x + fw / 2) / w
        cy = (y + fh * 0.35) / h
        area = (fw * fh) / (w * h)
        out.append((float(cx), float(cy), float(area)))
    out.sort(key=lambda t: t[2], reverse=True)
    return out


def estimate_two_subjects(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
) -> list[tuple[float, float]]:
    """Jusqu'à 2 centres visage (cx, cy) pour layout Split."""
    n = max(3, int(os.getenv("REFRAME_SAMPLES", "8")))
    duration = max(0.2, float(end_sec) - float(start_sec))
    margin = min(0.35, duration * 0.08)
    t0 = float(start_sec) + margin
    t1 = float(end_sec) - margin
    if t1 <= t0:
        t0, t1 = float(start_sec), float(end_sec)

    times = np.linspace(t0, t1, n)
    frames_dir = work_dir / "reframe_frames_split"
    if frames_dir.exists():
        shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Accumule votes par "slot" gauche/droite selon cx
    left: list[tuple[float, float, float]] = []
    right: list[tuple[float, float, float]] = []
    for i, t in enumerate(times):
        frame_path = frames_dir / f"f_{i:02d}.jpg"
        if not _extract_frame(source_path, float(t), frame_path):
            continue
        faces = _detect_faces_on_frame(frame_path)
        for cx, cy, area in faces[:2]:
            if cx < 0.5:
                left.append((cx, cy, area))
            else:
                right.append((cx, cy, area))

    shutil.rmtree(frames_dir, ignore_errors=True)

    def _avg(bucket: list[tuple[float, float, float]]) -> tuple[float, float] | None:
        if not bucket:
            return None
        w = np.asarray([b[2] for b in bucket], dtype=np.float64)
        w = w / w.sum()
        cx = float(np.average([b[0] for b in bucket], weights=w))
        cy = float(np.average([b[1] for b in bucket], weights=w))
        return min(0.92, max(0.08, cx)), min(0.75, max(0.2, cy))

    centers: list[tuple[float, float]] = []
    for bucket in (left, right):
        hit = _avg(bucket)
        if hit:
            centers.append(hit)
    # Si un seul côté a des faces, prendre top-2 globaux
    if len(centers) < 2:
        # Re-sample mid frame
        mid = (t0 + t1) / 2
        tmp = work_dir / "split_mid.jpg"
        if _extract_frame(source_path, mid, tmp):
            faces = _detect_faces_on_frame(tmp)
            centers = [(f[0], f[1]) for f in faces[:2]]
            tmp.unlink(missing_ok=True)
    if len(centers) == 0:
        return [(0.35, 0.4), (0.65, 0.4)]
    if len(centers) == 1:
        cx, cy = centers[0]
        return [(max(0.2, cx - 0.2), cy), (min(0.8, cx + 0.2), cy)]
    return centers[:2]


def build_split_filter_complex(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
    *,
    swap: bool = False,
    focus_top: dict[str, float] | None = None,
    focus_bot: dict[str, float] | None = None,
) -> str:
    width, height = _ffprobe_size(source_path)
    half_h = OUT_H // 2
    target_a = OUT_W / half_h

    def _crop_from_focus(
        cx: float, cy: float, zoom: float
    ) -> tuple[int, int, int, int]:
        z = max(1.0, min(2.5, float(zoom)))
        # zoom↑ → fenêtre de crop plus petite
        if width / height >= target_a:
            ch = height
            cw = int(round(height * target_a / z))
            cw = max(2, min(cw, width))
            cw -= cw % 2
            x = int(round(cx * width - cw / 2))
            x = max(0, min(x, width - cw))
            return cw, ch, x, 0
        cw = width
        ch = int(round(width / target_a / z))
        ch = max(2, min(ch, height))
        ch -= ch % 2
        y = int(round(cy * height - ch / 2))
        y = max(0, min(y, height - ch))
        return cw, ch, 0, y

    manual = (
        isinstance(focus_top, dict)
        and isinstance(focus_bot, dict)
        and "cx" in focus_top
        and "cx" in focus_bot
    )

    if manual:
        crops = [
            _crop_from_focus(
                float(focus_top["cx"]),
                float(focus_top.get("cy", 0.4)),
                float(focus_top.get("zoom", 1.2)),
            ),
            _crop_from_focus(
                float(focus_bot["cx"]),
                float(focus_bot.get("cy", 0.4)),
                float(focus_bot.get("zoom", 1.2)),
            ),
        ]
    else:
        centers = estimate_two_subjects(source_path, start_sec, end_sec, work_dir)
        crops = []
        for cx, cy in centers[:2]:
            cw, ch, x, y = compute_crop_box(width, height, cx, cy)
            # Forcer crop plus carré-horizontal pour demi-écran : aspect 1080:960
            if width / height >= target_a:
                ch2 = height
                cw2 = int(round(height * target_a))
                cw2 = min(cw2, width)
                x2 = int(round(cx * width - cw2 / 2))
                x2 = max(0, min(x2, width - cw2))
                y2 = 0
                cw, ch, x, y = cw2, ch2, x2, y2
            else:
                cw2 = width
                ch2 = int(round(width / target_a))
                ch2 = min(ch2, height)
                y2 = int(round(cy * height - ch2 / 2))
                y2 = max(0, min(y2, height - ch2))
                cw, ch, x, y = cw2, ch2, 0, y2
            cw = max(2, cw - (cw % 2))
            ch = max(2, ch - (ch % 2))
            crops.append((cw, ch, x, y))

        while len(crops) < 2:
            crops.append(crops[0] if crops else (width, height, 0, 0))

    if swap:
        crops = [crops[1], crops[0]]

    (cw0, ch0, x0, y0) = crops[0]
    (cw1, ch1, x1, y1) = crops[1]
    return (
        f"[0:v]crop={cw0}:{ch0}:{x0}:{y0},scale={OUT_W}:{half_h}[top];"
        f"[0:v]crop={cw1}:{ch1}:{x1}:{y1},scale={OUT_W}:{half_h}[bot];"
        f"[top][bot]vstack=inputs=2[vout]"
    )


def compute_crop_box_zoomed(
    width: int,
    height: int,
    cx: float,
    cy: float,
    zoom: float = 1.0,
) -> tuple[int, int, int, int]:
    """Crop 9:16 centré sur (cx,cy), zoom↑ = fenêtre plus petite."""
    crop_w, crop_h, _x, _y = compute_crop_box(width, height, cx, cy)
    z = max(1.0, min(2.5, float(zoom)))
    if z > 1.01:
        crop_w = max(2, int(round(crop_w / z)))
        crop_h = max(2, int(round(crop_h / z)))
        crop_w -= crop_w % 2
        crop_h -= crop_h % 2
    x = int(round(cx * width - crop_w / 2))
    y = int(round(cy * height - crop_h / 2))
    x = max(0, min(x, width - crop_w))
    y = max(0, min(y, height - crop_h))
    return crop_w, crop_h, x, y


def build_reframe_vf(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
    layout_mode: str | None = None,
    *,
    split_swap: bool = False,
    split_focus_top: dict[str, float] | None = None,
    split_focus_bot: dict[str, float] | None = None,
    smart_focus: dict[str, float] | None = None,
) -> tuple[str, str | None]:
    """
    Retourne (vf_simple | "", filter_complex | None).
    Modes: smart | fill | fit | split | center | letterbox
    """
    mode = (
        layout_mode
        or os.getenv("REFRAME_MODE")
        or "smart"
    ).strip().lower()
    # Alias Opus
    if mode == "fill":
        mode = "center"
    if mode == "fit":
        mode = "letterbox"

    if mode == "split":
        try:
            fc = build_split_filter_complex(
                source_path,
                start_sec,
                end_sec,
                work_dir,
                swap=split_swap,
                focus_top=split_focus_top,
                focus_bot=split_focus_bot,
            )
            return "", fc
        except Exception as e:
            log.warning("Split échoué (%s) — fallback smart", e)
            mode = "smart"

    if mode == "letterbox":
        return (
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2",
            None,
        )

    try:
        width, height = _ffprobe_size(source_path)
    except Exception as e:
        log.warning("ffprobe size échoué (%s) — letterbox", e)
        return (
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2",
            None,
        )

    zoom = 1.0
    manual_smart = (
        smart_focus
        and isinstance(smart_focus, dict)
        and mode in ("smart", "center")
        and "cx" in smart_focus
    )

    if manual_smart:
        try:
            cx = float(smart_focus.get("cx", 0.5))
            cy = float(smart_focus.get("cy", 0.42))
            zoom = float(smart_focus.get("zoom", 1.0))
            log.info(
                "Smart focus manuel cx=%.2f cy=%.2f zoom=%.2f",
                cx,
                cy,
                zoom,
            )
        except (TypeError, ValueError):
            cx, cy = 0.5, 0.42
        crop_w, crop_h, x, y = compute_crop_box_zoomed(
            width, height, cx, cy, zoom
        )
        return f"crop={crop_w}:{crop_h}:{x}:{y},scale={OUT_W}:{OUT_H}", None

    if mode == "center":
        cx, cy = 0.5, 0.42
        crop_w, crop_h, x, y = compute_crop_box_zoomed(
            width, height, cx, cy, zoom
        )
        return f"crop={crop_w}:{crop_h}:{x}:{y},scale={OUT_W}:{OUT_H}", None

    # smart (défaut) : tracking dense → filter_complex segments
    track_on = os.getenv("REFRAME_TRACK", "1") not in ("0", "false", "False")
    if mode == "smart" and track_on:
        try:
            fc = build_smart_tracking_filter(
                source_path,
                start_sec,
                end_sec,
                work_dir,
                zoom=zoom,
            )
            if fc:
                return "", fc
        except Exception as e:
            log.warning("Smart track échoué (%s) — crop fixe", e)

    try:
        cx, cy = estimate_subject_center(
            source_path, start_sec, end_sec, work_dir
        )
    except Exception as e:
        log.warning("Détection visage échouée (%s) — center crop", e)
        cx, cy = 0.5, 0.42

    crop_w, crop_h, x, y = compute_crop_box_zoomed(
        width, height, cx, cy, zoom
    )
    log.info(
        "Crop fixe %dx%d @ %d,%d (source %dx%d) → %dx%d mode=%s",
        crop_w,
        crop_h,
        x,
        y,
        width,
        height,
        OUT_W,
        OUT_H,
        mode,
    )
    return f"crop={crop_w}:{crop_h}:{x}:{y},scale={OUT_W}:{OUT_H}", None

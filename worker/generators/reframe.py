"""
Reframe 9:16 intelligent : suit le visage / sujet (OpenCV Haar).
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
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(max(24, w // 40), max(24, h // 40)),
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


def estimate_subject_center(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
) -> tuple[float, float]:
    """
    Échantillonne des frames et retourne (cx, cy) normalisés [0,1].
    Centre image si aucun visage.
    """
    n = max(3, int(os.getenv("REFRAME_SAMPLES", "8")))
    duration = max(0.2, float(end_sec) - float(start_sec))
    # Évite les extrémités (fade / coupe)
    margin = min(0.35, duration * 0.08)
    t0 = float(start_sec) + margin
    t1 = float(end_sec) - margin
    if t1 <= t0:
        t0, t1 = float(start_sec), float(end_sec)

    times = np.linspace(t0, t1, n)
    weights: list[float] = []
    cxs: list[float] = []
    cys: list[float] = []

    frames_dir = work_dir / "reframe_frames"
    if frames_dir.exists():
        shutil.rmtree(frames_dir, ignore_errors=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    for i, t in enumerate(times):
        frame_path = frames_dir / f"f_{i:02d}.jpg"
        if not _extract_frame(source_path, float(t), frame_path):
            continue
        hit = _detect_face_center(frame_path)
        if hit is None:
            continue
        cx, cy, area = hit
        w = max(area, 0.01)
        cxs.append(cx)
        cys.append(cy)
        weights.append(w)

    # Nettoyage frames (disk)
    shutil.rmtree(frames_dir, ignore_errors=True)

    if not cxs:
        log.info("Aucun visage détecté — crop centré")
        return 0.5, 0.42  # légèrement haut pour talking-head

    warr = np.asarray(weights, dtype=np.float64)
    warr = warr / warr.sum()
    cx = float(np.average(np.asarray(cxs), weights=warr))
    cy = float(np.average(np.asarray(cys), weights=warr))
    # Clamp soft
    cx = min(0.92, max(0.08, cx))
    cy = min(0.75, max(0.2, cy))
    log.info(
        "Reframe sujet cx=%.2f cy=%.2f (%d/%d frames avec visage)",
        cx,
        cy,
        len(cxs),
        n,
    )
    return cx, cy


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


def build_reframe_vf(
    source_path: Path,
    start_sec: float,
    end_sec: float,
    work_dir: Path,
) -> str:
    """
    Filtre ffmpeg : crop smart (ou mode forcé) + scale 1080x1920.
    Modes: smart (défaut) | center | letterbox
    """
    mode = (os.getenv("REFRAME_MODE") or "smart").strip().lower()

    if mode == "letterbox":
        return (
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2"
        )

    try:
        width, height = _ffprobe_size(source_path)
    except Exception as e:
        log.warning("ffprobe size échoué (%s) — letterbox", e)
        return (
            f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=decrease,"
            f"pad={OUT_W}:{OUT_H}:(ow-iw)/2:(oh-ih)/2"
        )

    if mode == "center":
        cx, cy = 0.5, 0.42
    else:
        try:
            cx, cy = estimate_subject_center(
                source_path, start_sec, end_sec, work_dir
            )
        except Exception as e:
            log.warning("Détection visage échouée (%s) — center crop", e)
            cx, cy = 0.5, 0.42

    crop_w, crop_h, x, y = compute_crop_box(width, height, cx, cy)
    log.info(
        "Crop %dx%d @ %d,%d (source %dx%d) → %dx%d",
        crop_w,
        crop_h,
        x,
        y,
        width,
        height,
        OUT_W,
        OUT_H,
    )
    return f"crop={crop_w}:{crop_h}:{x}:{y},scale={OUT_W}:{OUT_H}"

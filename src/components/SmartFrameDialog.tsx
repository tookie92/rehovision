"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  clampSmartFocus,
  DEFAULT_SMART_FOCUS,
  type SplitFocusPane,
} from "@/lib/renderPresets";

/** Aspect full 9:16 (1080×1920). */
const FULL_ASPECT = 1080 / 1920;

type NormBox = { x: number; y: number; w: number; h: number };

type Props = {
  open: boolean;
  sourceUrl: string;
  startSec: number;
  endSec: number;
  focus: SplitFocusPane;
  onClose: () => void;
  onApply: (focus: SplitFocusPane) => void;
  onResetAuto: () => void;
};

function focusToBox(focus: SplitFocusPane, videoAspect: number): NormBox {
  const naturalW =
    videoAspect >= FULL_ASPECT
      ? FULL_ASPECT / videoAspect / focus.zoom
      : 1 / focus.zoom;
  const naturalH =
    videoAspect >= FULL_ASPECT
      ? 1 / focus.zoom
      : videoAspect / FULL_ASPECT / focus.zoom;
  const w = Math.min(0.95, Math.max(0.12, naturalW));
  const h = Math.min(0.95, Math.max(0.12, naturalH));
  return {
    x: Math.min(1 - w, Math.max(0, focus.cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, focus.cy - h / 2)),
    w,
    h,
  };
}

function boxToFocus(box: NormBox, videoAspect: number): SplitFocusPane {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const naturalW =
    videoAspect >= FULL_ASPECT ? FULL_ASPECT / videoAspect : 1;
  const zoom = Math.max(1, Math.min(2.5, naturalW / Math.max(0.08, box.w)));
  return clampSmartFocus({ cx, cy, zoom });
}

function CropBox({
  box,
  videoRect,
  onChange,
}: {
  box: NormBox;
  videoRect: { left: number; top: number; width: number; height: number };
  onChange: (b: NormBox) => void;
}) {
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: NormBox;
  } | null>(null);

  const left = videoRect.left + box.x * videoRect.width;
  const top = videoRect.top + box.y * videoRect.height;
  const width = box.w * videoRect.width;
  const height = box.h * videoRect.height;

  function onPointerDown(
    e: ReactPointerEvent,
    mode: "move" | "resize",
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...box },
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || videoRect.width < 1) return;
    const dx = (e.clientX - d.startX) / videoRect.width;
    const dy = (e.clientY - d.startY) / videoRect.height;
    if (d.mode === "move") {
      onChange({
        ...d.orig,
        x: Math.min(1 - d.orig.w, Math.max(0, d.orig.x + dx)),
        y: Math.min(1 - d.orig.h, Math.max(0, d.orig.y + dy)),
      });
      return;
    }
    const aspectFrac = FULL_ASPECT / (videoRect.width / videoRect.height);
    let w = Math.min(0.95, Math.max(0.12, d.orig.w + dx));
    let h = w / aspectFrac;
    if (h > 0.95) {
      h = 0.95;
      w = h * aspectFrac;
    }
    if (d.orig.x + w > 1) w = 1 - d.orig.x;
    if (d.orig.y + h > 1) {
      h = 1 - d.orig.y;
      w = h * aspectFrac;
    }
    onChange({ ...d.orig, w: Math.max(0.12, w), h: Math.max(0.12, h) });
  }

  function onPointerUp(e: ReactPointerEvent) {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="absolute z-20 touch-none"
      style={{ left, top, width, height }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute inset-0 cursor-grab rounded-sm border-2 border-signal active:cursor-grabbing"
        style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }}
      />
      <span className="absolute -top-6 left-0 rounded bg-signal px-2 py-0.5 text-[11px] font-semibold text-signal-foreground">
        9:16
      </span>
      <button
        type="button"
        aria-label="Redimensionner le cadre"
        className="absolute -bottom-1.5 -right-1.5 z-30 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-signal"
        onPointerDown={(e) => onPointerDown(e, "resize")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

/**
 * Dialog landscape — 1 cadre 9:16 pour Smart / Fill (CapCut-like).
 */
export function SmartFrameDialog({
  open,
  sourceUrl,
  startSec,
  endSec,
  focus,
  onClose,
  onApply,
  onResetAuto,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [videoRect, setVideoRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [box, setBox] = useState<NormBox>(() =>
    focusToBox(focus, 16 / 9),
  );

  const measure = useCallback(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const va =
      video.videoWidth > 0
        ? video.videoWidth / video.videoHeight
        : videoAspect;
    let width = sw;
    let height = width / va;
    if (height > sh) {
      height = sh;
      width = height * va;
    }
    setVideoRect({
      left: (sw - width) / 2,
      top: (sh - height) / 2,
      width,
      height,
    });
  }, [videoAspect]);

  useEffect(() => {
    if (!open) return;
    setBox(focusToBox(focus, videoAspect));
  }, [open, focus, videoAspect]);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      if (video.videoWidth > 0) {
        setVideoAspect(video.videoWidth / video.videoHeight);
      }
      video.currentTime = startSec;
      void video.play().catch(() => undefined);
      requestAnimationFrame(measure);
    };
    const onTime = () => {
      if (video.currentTime >= endSec - 0.05) {
        video.currentTime = startSec;
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("timeupdate", onTime);
    window.addEventListener("resize", measure);
    if (video.readyState >= 1) onMeta();
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("timeupdate", onTime);
      window.removeEventListener("resize", measure);
    };
  }, [open, sourceUrl, startSec, endSec, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(6_18_12_/_0.82)] p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Cadrer le sujet"
      onClick={onClose}
    >
      <div
        className="atelier-rise flex max-h-[min(94dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-signal/20 bg-[#0c1f16] shadow-[0_32px_80px_-24px_rgb(0_0_0_/_0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3.5">
          <div>
            <p className="atelier-label mb-1 text-signal">Smart · Fill</p>
            <h2 className="font-display text-xl tracking-tight text-[#f7f9f7]">
              Cadrer le sujet
            </h2>
            <p className="mt-0.5 text-xs text-white/55">
              Place le cadre 9:16 sur le visage, puis Appliquer.
            </p>
          </div>
        </header>

        <div
          ref={stageRef}
          className="relative min-h-[260px] flex-1 bg-black sm:min-h-[460px]"
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            key={sourceUrl}
            src={sourceUrl}
            playsInline
            muted
            preload="metadata"
            className="pointer-events-none absolute"
            style={{
              left: videoRect.left,
              top: videoRect.top,
              width: videoRect.width,
              height: videoRect.height,
            }}
          />
          {videoRect.width > 0 && (
            <CropBox box={box} videoRect={videoRect} onChange={setBox} />
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3.5">
          <Button
            type="button"
            variant="ghost"
            className="cursor-pointer text-white/70 hover:bg-white/8 hover:text-white"
            onClick={onClose}
          >
            Fermer
          </Button>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer border-white/15 bg-transparent text-white/80 hover:bg-white/8 hover:text-white"
            onClick={() => {
              onResetAuto();
              setBox(focusToBox(DEFAULT_SMART_FOCUS, videoAspect));
            }}
          >
            Reset auto
          </Button>
          <div className="ml-auto">
            <Button
              type="button"
              className="cta-signal cursor-pointer border-0 px-5 hover:bg-signal"
              onClick={() => {
                onApply(boxToFocus(box, videoAspect));
                onClose();
              }}
            >
              Appliquer
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

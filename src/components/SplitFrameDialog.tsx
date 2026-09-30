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
  clampSplitFocus,
  DEFAULT_SPLIT_FOCUS_BOT,
  DEFAULT_SPLIT_FOCUS_TOP,
  type SplitFocusPane,
} from "@/lib/renderPresets";

/** Aspect d’un demi-écran Split (1080×960). */
const HALF_ASPECT = 1080 / 960;

type NormBox = { x: number; y: number; w: number; h: number };

type Props = {
  open: boolean;
  sourceUrl: string;
  startSec: number;
  endSec: number;
  focusTop: SplitFocusPane;
  focusBot: SplitFocusPane;
  onClose: () => void;
  onApply: (top: SplitFocusPane, bot: SplitFocusPane) => void;
  onResetAuto: () => void;
};

function focusToBox(
  focus: SplitFocusPane,
  videoAspect: number,
): NormBox {
  // Sur source landscape : crop pleine hauteur / zoom
  const naturalW =
    videoAspect >= HALF_ASPECT
      ? HALF_ASPECT / videoAspect / focus.zoom
      : 1 / focus.zoom;
  const naturalH =
    videoAspect >= HALF_ASPECT
      ? 1 / focus.zoom
      : videoAspect / HALF_ASPECT / focus.zoom;
  const w = Math.min(0.95, Math.max(0.18, naturalW));
  const h = Math.min(0.95, Math.max(0.18, naturalH));
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
    videoAspect >= HALF_ASPECT ? HALF_ASPECT / videoAspect : 1;
  const zoom = Math.max(1, Math.min(2.5, naturalW / Math.max(0.08, box.w)));
  return clampSplitFocus({ cx, cy, zoom });
}

function CropBox({
  label,
  color,
  box,
  videoRect,
  onChange,
}: {
  label: string;
  color: string;
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
    // Resize coin bas-droit, conserve aspect HALF_ASPECT en coords vidéo
    // → w/h = HALF_ASPECT / videoAspect  (en fractions)
    const aspectFrac = HALF_ASPECT / (videoRect.width / videoRect.height);
    let w = Math.min(0.95, Math.max(0.18, d.orig.w + dx));
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
    onChange({ ...d.orig, w: Math.max(0.18, w), h: Math.max(0.18, h) });
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
        className="absolute inset-0 cursor-grab rounded-sm border-2 active:cursor-grabbing"
        style={{ borderColor: color, boxShadow: `0 0 0 1px rgb(0 0 0 / 0.45)` }}
      />
      <span
        className="absolute -top-6 left-0 rounded px-2 py-0.5 text-[11px] font-semibold text-white"
        style={{ background: color }}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={`Redimensionner ${label}`}
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
 * Dialog CapCut-like : source landscape + 2 cadres pour Split haut/bas.
 */
export function SplitFrameDialog({
  open,
  sourceUrl,
  startSec,
  endSec,
  focusTop,
  focusBot,
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
  const [boxTop, setBoxTop] = useState<NormBox>(() =>
    focusToBox(focusTop, 16 / 9),
  );
  const [boxBot, setBoxBot] = useState<NormBox>(() =>
    focusToBox(focusBot, 16 / 9),
  );
  const [active, setActive] = useState<"top" | "bot">("top");

  const measure = useCallback(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const va = video.videoWidth > 0 ? video.videoWidth / video.videoHeight : videoAspect;
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
    setBoxTop(focusToBox(focusTop, videoAspect));
    setBoxBot(focusToBox(focusBot, videoAspect));
  }, [open, focusTop, focusBot, videoAspect]);

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
      aria-label="Cadrer les visages Split"
      onClick={onClose}
    >
      <div
        className="atelier-rise flex max-h-[min(94dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-signal/20 bg-[#0c1f16] shadow-[0_32px_80px_-24px_rgb(0_0_0_/_0.75),0_0_0_1px_color-mix(in_oklab,var(--signal)_18%,transparent)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3.5">
          <div>
            <p className="atelier-label mb-1 text-signal">Split · landscape</p>
            <h2 className="font-display text-xl tracking-tight text-[#f7f9f7]">
              Cadrer les visages
            </h2>
            <p className="mt-0.5 text-xs text-white/55">
              Glisse les cadres Haut & Bas sur la source, puis Appliquer.
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActive("top")}
              className={
                active === "top"
                  ? "cursor-pointer rounded-lg bg-signal/25 px-3 py-2 text-xs font-semibold text-signal ring-1 ring-signal/50"
                  : "cursor-pointer rounded-lg bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white/85"
              }
            >
              Haut
            </button>
            <button
              type="button"
              onClick={() => setActive("bot")}
              className={
                active === "bot"
                  ? "cursor-pointer rounded-lg bg-[#c4a484]/30 px-3 py-2 text-xs font-semibold text-[#e8d0b0] ring-1 ring-[#c4a484]/45"
                  : "cursor-pointer rounded-lg bg-white/6 px-3 py-2 text-xs text-white/55 hover:text-white/85"
              }
            >
              Bas
            </button>
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
            <>
              <CropBox
                label="Haut"
                color="#92ff5f"
                box={boxTop}
                videoRect={videoRect}
                onChange={(b) => {
                  setActive("top");
                  setBoxTop(b);
                }}
              />
              <CropBox
                label="Bas"
                color="#c4a484"
                box={boxBot}
                videoRect={videoRect}
                onChange={(b) => {
                  setActive("bot");
                  setBoxBot(b);
                }}
              />
            </>
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
              setBoxTop(focusToBox(DEFAULT_SPLIT_FOCUS_TOP, videoAspect));
              setBoxBot(focusToBox(DEFAULT_SPLIT_FOCUS_BOT, videoAspect));
            }}
          >
            Reset IA
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              className="cta-signal cursor-pointer border-0 px-5 hover:bg-signal"
              onClick={() => {
                onApply(
                  boxToFocus(boxTop, videoAspect),
                  boxToFocus(boxBot, videoAspect),
                );
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

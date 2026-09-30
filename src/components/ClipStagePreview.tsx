"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  logoCornerClass,
  punchScale,
  softCaptionStyle,
  softLookCssFilter,
  softLookNeedsRealRender,
} from "@/lib/softPreview";
import {
  formatClipDuration,
  formatTimecode,
} from "@/lib/clipStatus";
import type {
  CaptionStyleId,
  LayoutModeId,
  LookFilterId,
  LogoCornerId,
  PunchEffectId,
  SplitFocusPane,
} from "@/lib/renderPresets";
import {
  DEFAULT_SPLIT_FOCUS_BOT,
  DEFAULT_SPLIT_FOCUS_TOP,
  clampSplitFocus,
} from "@/lib/renderPresets";

type ClipLike = {
  title: string;
  startSec: number;
  endSec: number;
  captionText?: string | null;
  hookReason?: string | null;
  viralScore?: number | null;
  resultUrl?: string | null;
  status: string;
};

type Props = {
  clip: ClipLike;
  sourceUrl?: string | null;
  softPreview: boolean;
  captionStyle: CaptionStyleId;
  lookFilter: LookFilterId;
  punchEffect: PunchEffectId;
  layoutMode?: LayoutModeId;
  splitSwap?: boolean;
  splitFocusTop?: SplitFocusPane | null;
  splitFocusBot?: SplitFocusPane | null;
  smartFocus?: SplitFocusPane | null;
  onSplitFocusChange?: (pane: "top" | "bot", focus: SplitFocusPane) => void;
  logoUrl?: string | null;
  logoCorner: LogoCornerId;
  logoOpacity: number;
  /** Compact = stage seul (workspace), sans colonne meta à droite */
  compact?: boolean;
  editing?: boolean;
  editSlot?: ReactNode;
};

function SoftSplitVideos({
  sourceUrl,
  startSec,
  endSec,
  swap,
  filterCss,
  scale,
  focusTop,
  focusBot,
  editable,
  onFocusChange,
}: {
  sourceUrl: string;
  startSec: number;
  endSec: number;
  swap: boolean;
  filterCss: string;
  scale: number;
  focusTop: SplitFocusPane;
  focusBot: SplitFocusPane;
  editable: boolean;
  onFocusChange?: (pane: "top" | "bot", focus: SplitFocusPane) => void;
}) {
  const topRef = useRef<HTMLVideoElement>(null);
  const botRef = useRef<HTMLVideoElement>(null);
  const topBoxRef = useRef<HTMLDivElement>(null);
  const botBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pane: "top" | "bot";
    startX: number;
    startY: number;
    cx: number;
    cy: number;
  } | null>(null);

  useEffect(() => {
    const top = topRef.current;
    const bot = botRef.current;
    if (!top || !bot) return;

    const syncTo = (t: number) => {
      const clamped = Math.min(Math.max(t, startSec), endSec - 0.05);
      if (Math.abs(bot.currentTime - clamped) > 0.12) {
        bot.currentTime = clamped;
      }
    };

    const onMeta = () => {
      top.currentTime = startSec;
      bot.currentTime = startSec;
      void top.play().catch(() => undefined);
      void bot.play().catch(() => undefined);
    };
    const onTime = () => {
      if (top.currentTime >= endSec - 0.05) {
        top.currentTime = startSec;
        bot.currentTime = startSec;
        return;
      }
      syncTo(top.currentTime);
    };

    top.addEventListener("loadedmetadata", onMeta);
    top.addEventListener("timeupdate", onTime);
    if (top.readyState >= 1) onMeta();
    return () => {
      top.removeEventListener("loadedmetadata", onMeta);
      top.removeEventListener("timeupdate", onTime);
    };
  }, [sourceUrl, startSec, endSec]);

  const topF = swap ? focusBot : focusTop;
  const botF = swap ? focusTop : focusBot;
  const styleBase = {
    filter: filterCss === "none" ? undefined : filterCss,
  };

  function startDrag(
    pane: "top" | "bot",
    e: ReactPointerEvent<HTMLDivElement>,
    focus: SplitFocusPane,
  ) {
    if (!editable || !onFocusChange) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pane,
      startX: e.clientX,
      startY: e.clientY,
      cx: focus.cx,
      cy: focus.cy,
    };
  }

  function moveDrag(e: ReactPointerEvent<HTMLDivElement>, box: HTMLDivElement | null) {
    const d = dragRef.current;
    if (!d || !onFocusChange || !box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    const logical: "top" | "bot" =
      swap ? (d.pane === "top" ? "bot" : "top") : d.pane;
    const base = logical === "top" ? focusTop : focusBot;
    onFocusChange(
      logical,
      clampSplitFocus({
        cx: d.cx - dx,
        cy: d.cy - dy,
        zoom: base.zoom,
      }),
    );
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function ZoomBtns({
    focus,
    pane,
  }: {
    focus: SplitFocusPane;
    pane: "top" | "bot";
  }) {
    if (!editable || !onFocusChange) return null;
    const logical: "top" | "bot" = swap ? (pane === "top" ? "bot" : "top") : pane;
    return (
      <div className="absolute bottom-1 right-1 z-30 flex gap-0.5">
        <button
          type="button"
          className="size-7 cursor-pointer rounded bg-background/80 text-xs font-bold backdrop-blur-sm"
          aria-label="Zoom −"
          onClick={() =>
            onFocusChange(
              logical,
              clampSplitFocus({ ...focus, zoom: focus.zoom - 0.15 }),
            )
          }
        >
          −
        </button>
        <button
          type="button"
          className="size-7 cursor-pointer rounded bg-background/80 text-xs font-bold backdrop-blur-sm"
          aria-label="Zoom +"
          onClick={() =>
            onFocusChange(
              logical,
              clampSplitFocus({ ...focus, zoom: focus.zoom + 0.15 }),
            )
          }
        >
          +
        </button>
      </div>
    );
  }

  function FrameOverlay({ label, focus }: { label: string; focus: SplitFocusPane }) {
    if (!editable) return null;
    const size = `${Math.round(44 / focus.zoom)}%`;
    return (
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_1px_rgb(0_0_0_/_0.4)]"
        style={{ width: size, height: size }}
      >
        <span className="absolute -top-5 left-0 rounded bg-[#8b5e3c] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          {label}
        </span>
        <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div ref={topBoxRef} className="relative h-1/2 overflow-hidden">
        <video
          ref={topRef}
          key={`split-a-${sourceUrl}-${startSec}`}
          src={sourceUrl}
          playsInline
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            ...styleBase,
            objectPosition: `${topF.cx * 100}% ${topF.cy * 100}%`,
            transform: `scale(${scale * topF.zoom})`,
          }}
        />
        {editable && (
          <div
            className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => startDrag("top", e, topF)}
            onPointerMove={(e) => moveDrag(e, topBoxRef.current)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="Cadre haut — glisser"
          />
        )}
        <FrameOverlay label="Haut" focus={topF} />
        <ZoomBtns focus={topF} pane="top" />
      </div>
      <div
        ref={botBoxRef}
        className="relative h-1/2 overflow-hidden border-t border-white/25"
      >
        <video
          ref={botRef}
          key={`split-b-${sourceUrl}-${startSec}`}
          src={sourceUrl}
          playsInline
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            ...styleBase,
            objectPosition: `${botF.cx * 100}% ${botF.cy * 100}%`,
            transform: `scale(${scale * botF.zoom})`,
          }}
        />
        {editable && (
          <div
            className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(e) => startDrag("bot", e, botF)}
            onPointerMove={(e) => moveDrag(e, botBoxRef.current)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="Cadre bas — glisser"
          />
        )}
        <FrameOverlay label="Bas" focus={botF} />
        <ZoomBtns focus={botF} pane="bot" />
      </div>
    </div>
  );
}

/**
 * Stage 9:16 — preview source In/Out (soft polish) ou rendu final.
 */
export function ClipStagePreview({
  clip,
  sourceUrl,
  softPreview,
  captionStyle,
  lookFilter,
  punchEffect,
  layoutMode = "smart",
  splitSwap = false,
  splitFocusTop,
  splitFocusBot,
  smartFocus,
  onSplitFocusChange,
  logoUrl,
  logoCorner,
  logoOpacity,
  compact = false,
  editing,
  editSlot,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"soft" | "final">(
    softPreview || !clip.resultUrl ? "soft" : "final",
  );

  const canFinal = Boolean(clip.resultUrl);
  const canSoft = Boolean(sourceUrl);
  const activeMode =
    mode === "final" && canFinal
      ? "final"
      : canSoft
        ? "soft"
        : canFinal
          ? "final"
          : "soft";

  const lookFilterCss = softLookCssFilter(lookFilter);
  const caption = softCaptionStyle(captionStyle);
  const scale = punchScale(punchEffect);
  const showGrain =
    (lookFilter === "soft_grain" || lookFilter === "lut") &&
    activeMode === "soft";
  const showFlash = punchEffect === "flash" && activeMode === "soft";
  const lutHint = softLookNeedsRealRender(lookFilter) && activeMode === "soft";
  const softSplit = activeMode === "soft" && layoutMode === "split" && Boolean(sourceUrl);
  const focusTop = splitFocusTop ?? DEFAULT_SPLIT_FOCUS_TOP;
  const focusBot = splitFocusBot ?? DEFAULT_SPLIT_FOCUS_BOT;

  useEffect(() => {
    if (softPreview && canSoft) setMode("soft");
    else if (canFinal && !softPreview) setMode("final");
  }, [
    clip.startSec,
    clip.endSec,
    clip.resultUrl,
    softPreview,
    canSoft,
    canFinal,
    lookFilter,
    captionStyle,
    punchEffect,
    layoutMode,
    splitSwap,
    splitFocusTop,
    splitFocusBot,
    smartFocus,
  ]);

  useEffect(() => {
    if (softSplit) return;
    const el = videoRef.current;
    if (!el || activeMode !== "soft" || !sourceUrl) return;
    const onMeta = () => {
      el.currentTime = clip.startSec;
      void el.play().catch(() => undefined);
    };
    const onTime = () => {
      if (el.currentTime >= clip.endSec - 0.05) {
        el.currentTime = clip.startSec;
      }
      if (el.currentTime < clip.startSec - 0.2) {
        el.currentTime = clip.startSec;
      }
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    if (el.readyState >= 1) onMeta();
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
    };
  }, [activeMode, sourceUrl, clip.startSec, clip.endSec, softSplit]);

  const duration = formatClipDuration(clip.startSec, clip.endSec);
  const captionRaw =
    (clip.captionText || "").trim() || "Exemple de caption soft";
  const captionText = caption?.uppercase
    ? captionRaw.toUpperCase()
    : captionRaw;
  const captionWords = captionText.split(/\s+/).filter(Boolean).slice(0, 14);

  /** Soft Smart/Fill : object-position manuel (smartFocus) ou FaceDetector. */
  const [objectPos, setObjectPos] = useState("50% 35%");
  const [smartZoom, setSmartZoom] = useState(1);
  useEffect(() => {
    if (activeMode !== "soft" || softSplit) return;
    if (layoutMode === "fit") {
      setObjectPos("50% 50%");
      setSmartZoom(1);
      return;
    }
    if (layoutMode !== "smart" && layoutMode !== "fill") {
      setObjectPos("50% 50%");
      setSmartZoom(1);
      return;
    }

    if (smartFocus) {
      const cx = Math.min(92, Math.max(8, smartFocus.cx * 100));
      const cy = Math.min(85, Math.max(12, smartFocus.cy * 100));
      setObjectPos(`${cx.toFixed(1)}% ${cy.toFixed(1)}%`);
      setSmartZoom(Math.min(2.5, Math.max(1, smartFocus.zoom)));
      return;
    }

    setSmartZoom(1);
    const el = videoRef.current;
    if (!el) {
      setObjectPos("50% 35%");
      return;
    }

    let cancelled = false;
    const run = async () => {
      type FaceBox = { boundingBox: DOMRectReadOnly };
      type FaceDetectorLike = {
        detect: (src: ImageBitmapSource) => Promise<FaceBox[]>;
      };
      const FD = (
        window as unknown as {
          FaceDetector?: new (o?: { fastMode?: boolean }) => FaceDetectorLike;
        }
      ).FaceDetector;
      if (!FD || el.videoWidth < 2) {
        if (!cancelled) setObjectPos("50% 35%");
        return;
      }
      try {
        const detector = new FD({ fastMode: true });
        const faces = await detector.detect(el);
        if (cancelled || faces.length === 0) {
          if (!cancelled) setObjectPos("50% 35%");
          return;
        }
        const best = faces.reduce((a, b) =>
          a.boundingBox.width * a.boundingBox.height >=
          b.boundingBox.width * b.boundingBox.height
            ? a
            : b,
        );
        const box = best.boundingBox;
        const cx = ((box.x + box.width / 2) / el.videoWidth) * 100;
        const cy = ((box.y + box.height * 0.35) / el.videoHeight) * 100;
        if (!cancelled) {
          setObjectPos(
            `${Math.min(92, Math.max(8, cx)).toFixed(1)}% ${Math.min(75, Math.max(18, cy)).toFixed(1)}%`,
          );
        }
      } catch {
        if (!cancelled) setObjectPos("50% 35%");
      }
    };

    const onReady = () => void run();
    el.addEventListener("loadeddata", onReady);
    el.addEventListener("seeked", onReady);
    if (el.readyState >= 2) onReady();
    const id = window.setInterval(() => void run(), 2500);
    return () => {
      cancelled = true;
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("seeked", onReady);
      window.clearInterval(id);
    };
  }, [
    activeMode,
    softSplit,
    layoutMode,
    sourceUrl,
    clip.startSec,
    clip.endSec,
    smartFocus,
  ]);

  const combinedScale = scale * smartZoom;

  const modeToggle = (canSoft || canFinal) && (
    <div
      className="flex shrink-0 gap-1.5"
      role="radiogroup"
      aria-label="Mode preview"
    >
      {canSoft && (
        <button
          type="button"
          role="radio"
          aria-checked={activeMode === "soft"}
          onClick={() => setMode("soft")}
          className={
            activeMode === "soft"
              ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-[11px] font-medium text-signal ring-1 ring-signal/40"
              : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          }
        >
          Soft
        </button>
      )}
      {canFinal && (
        <button
          type="button"
          role="radio"
          aria-checked={activeMode === "final"}
          onClick={() => setMode("final")}
          className={
            activeMode === "final"
              ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-[11px] font-medium text-signal ring-1 ring-signal/40"
              : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          }
        >
          Final
        </button>
      )}
    </div>
  );

  const phone = (
    <div
      className={
        compact
          ? "phone-frame relative mx-auto aspect-[9/16] h-[min(100%,calc(100dvh-14rem))] w-auto max-w-full overflow-hidden border border-border bg-black shadow-[0_0_0_1px_rgba(61,214,198,0.12)]"
          : "phone-frame relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden border border-border bg-black shadow-[0_0_0_1px_rgba(61,214,198,0.12)] lg:mx-0"
      }
    >
      {activeMode === "final" && clip.resultUrl ? (
        <video
          key={`final-${clip.resultUrl}`}
          src={clip.resultUrl}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : sourceUrl ? (
        <>
          {softSplit ? (
            <SoftSplitVideos
              sourceUrl={sourceUrl}
              startSec={clip.startSec}
              endSec={clip.endSec}
              swap={splitSwap}
              filterCss={lookFilterCss}
              scale={scale}
              focusTop={focusTop}
              focusBot={focusBot}
              editable={Boolean(onSplitFocusChange)}
              onFocusChange={onSplitFocusChange}
            />
          ) : (
            <video
              ref={videoRef}
              key={`soft-${sourceUrl}-${clip.startSec}-${clip.endSec}`}
              src={sourceUrl}
              controls={!compact}
              playsInline
              muted
              loop={false}
              preload="metadata"
              className={
                layoutMode === "fit"
                  ? "h-full w-full object-contain transition-[object-position] duration-300"
                  : "h-full w-full object-cover transition-[object-position] duration-300"
              }
              style={{
                objectPosition: objectPos,
                filter: lookFilterCss === "none" ? undefined : lookFilterCss,
                transform:
                  combinedScale !== 1 ? `scale(${combinedScale})` : undefined,
              }}
            />
          )}
          {showGrain && (
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
              aria-hidden
            />
          )}
          {showFlash && (
            <div
              key={`flash-${punchEffect}`}
              className="pointer-events-none absolute inset-0 animate-pulse bg-white/40"
              aria-hidden
            />
          )}
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className={`pointer-events-none absolute h-9 w-9 object-contain ${logoCornerClass(logoCorner)}`}
              style={{ opacity: logoOpacity }}
            />
          )}
          {caption && (
            <div className="pointer-events-none absolute inset-x-2 bottom-10 text-center">
              <p
                className={`${caption.sizeClass} ${caption.weight} ${caption.tracking} leading-tight`}
                style={{
                  color: caption.color,
                  WebkitTextStroke:
                    caption.stroke === "transparent"
                      ? undefined
                      : `2.5px ${caption.stroke}`,
                  paintOrder: "stroke fill",
                  textShadow:
                    caption.stroke === "transparent"
                      ? "0 2px 10px rgba(0,0,0,0.75)"
                      : "0 2px 0 rgba(0,0,0,0.85)",
                }}
              >
                {captionWords.map((w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="soft-word-pop mr-[0.28em] last:mr-0"
                    style={{ animationDelay: `${(i % 6) * 0.09}s` }}
                  >
                    {w}
                  </span>
                ))}
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/90">
            Soft
            {layoutMode === "split" ? " · Split" : ""}
            {layoutMode === "smart" ? " · face≈" : ""}
            {lookFilter !== "off" ? ` · ${lookFilter}` : ""}
            {captionStyle !== "off" ? ` · ${captionStyle}` : " · no caps"}
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Pas de source pour prévisualiser
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 overflow-hidden px-1">
        {phone}
        <div className="flex w-full max-w-sm shrink-0 flex-col items-center gap-1.5">
          {modeToggle}
          <h3 className="truncate text-sm font-semibold tracking-tight">
            {clip.title}
          </h3>
          <p className="font-mono text-[11px] text-muted-foreground">
            {formatTimecode(clip.startSec)}–{formatTimecode(clip.endSec)} ·{" "}
            {duration}
            {typeof clip.viralScore === "number"
              ? ` · ${Math.round(clip.viralScore)}`
              : ""}
          </p>
          {activeMode === "soft" && layoutMode === "smart" && (
            <p className="text-center text-[10px] text-muted-foreground">
              Soft ≈ visage navigateur · Final = OpenCV après Re-rendre
            </p>
          )}
          {clip.hookReason && (
            <p className="line-clamp-2 text-[11px] text-muted-foreground">
              {clip.hookReason}
            </p>
          )}
        </div>
        {editing && editSlot}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex w-full max-w-[320px] shrink-0 flex-col gap-2 lg:mx-0">
        {phone}
        {modeToggle}
        {activeMode === "soft" && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Soft ≈ navigateur ; export = Re-rendre.
            {lutHint ? " LUT : approx. soft, vrai grade au re-rendu." : ""}
            {softSplit
              ? " Cadre via « Cadrer les visages… » (dialog landscape)."
              : layoutMode === "smart"
                ? " Soft suit le visage si le navigateur le permet."
                : ""}
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{clip.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatTimecode(clip.startSec)}–{formatTimecode(clip.endSec)} ·{" "}
            {duration}
            {typeof clip.viralScore === "number"
              ? ` · score ${Math.round(clip.viralScore)}`
              : ""}
          </p>
        </div>
        {clip.hookReason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground/85">Pourquoi : </span>
            {clip.hookReason}
          </p>
        )}
        {clip.status === "failed" && (
          <p className="text-sm text-destructive" role="alert">
            Rendu en échec — ajuste ou re-rends ce clip.
          </p>
        )}
        {editing && editSlot}
      </div>
    </div>
  );
}

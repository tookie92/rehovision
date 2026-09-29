"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
}: {
  sourceUrl: string;
  startSec: number;
  endSec: number;
  swap: boolean;
  filterCss: string;
  scale: number;
}) {
  const topRef = useRef<HTMLVideoElement>(null);
  const botRef = useRef<HTMLVideoElement>(null);

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

  const posA = swap ? "70% 35%" : "30% 35%";
  const posB = swap ? "30% 35%" : "70% 35%";
  const style = {
    filter: filterCss === "none" ? undefined : filterCss,
    transform: scale !== 1 ? `scale(${scale})` : undefined,
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="relative h-1/2 overflow-hidden">
        <video
          ref={topRef}
          key={`split-a-${sourceUrl}-${startSec}`}
          src={sourceUrl}
          playsInline
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ ...style, objectPosition: posA }}
        />
      </div>
      <div className="relative h-1/2 overflow-hidden border-t border-white/25">
        <video
          ref={botRef}
          key={`split-b-${sourceUrl}-${startSec}`}
          src={sourceUrl}
          playsInline
          muted
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ ...style, objectPosition: posB }}
        />
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
  const captionShown =
    captionText.length > 90 ? `${captionText.slice(0, 87)}…` : captionText;

  const stage = (
    <div className={compact ? "mx-auto w-full max-w-[280px]" : "mx-auto w-full max-w-[320px] shrink-0 lg:mx-0"}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-black shadow-[0_0_0_1px_rgba(61,214,198,0.12)]">
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
                className="h-full w-full object-cover transition-transform duration-200"
                style={{
                  filter: lookFilterCss === "none" ? undefined : lookFilterCss,
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
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
              <div className="pointer-events-none absolute inset-x-2 bottom-12 text-center">
                <p
                  className={`${caption.sizeClass} ${caption.weight} ${caption.tracking} leading-tight`}
                  style={{
                    color: caption.color,
                    WebkitTextStroke:
                      caption.stroke === "transparent"
                        ? undefined
                        : `2px ${caption.stroke}`,
                    paintOrder: "stroke fill",
                    textShadow:
                      caption.stroke === "transparent"
                        ? "0 2px 10px rgba(0,0,0,0.75)"
                        : "0 2px 0 rgba(0,0,0,0.85)",
                  }}
                >
                  {captionShown}
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/90">
              Soft
              {layoutMode === "split" ? " · Split" : ""}
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

      {(canSoft || canFinal) && (
        <div
          className="mt-2 flex gap-1.5"
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
      )}
      {activeMode === "soft" && !compact && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Soft ≈ navigateur ; export = Re-rendre.
          {lutHint ? " LUT : approx. soft, vrai grade au re-rendu." : ""}
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        {stage}
        <div className="w-full max-w-[280px] space-y-1 text-center">
          <h3 className="truncate text-sm font-semibold tracking-tight">
            {clip.title}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {formatTimecode(clip.startSec)}–{formatTimecode(clip.endSec)} ·{" "}
            {duration}
            {typeof clip.viralScore === "number"
              ? ` · ${Math.round(clip.viralScore)}`
              : ""}
          </p>
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
      {stage}
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

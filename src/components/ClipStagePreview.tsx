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
  logoUrl?: string | null;
  logoCorner: LogoCornerId;
  logoOpacity: number;
  editing?: boolean;
  editSlot?: ReactNode;
};

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
  logoUrl,
  logoCorner,
  logoOpacity,
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
    mode === "final" && canFinal ? "final" : canSoft ? "soft" : canFinal ? "final" : "soft";

  const lookFilterCss = softLookCssFilter(lookFilter);
  const caption = softCaptionStyle(captionStyle);
  const scale = punchScale(punchEffect);
  const showGrain =
    (lookFilter === "soft_grain" || lookFilter === "lut") &&
    activeMode === "soft";
  const showFlash = punchEffect === "flash" && activeMode === "soft";
  const lutHint = softLookNeedsRealRender(lookFilter) && activeMode === "soft";

  // Sync mode when clip / softPreview changes
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
  ]);

  // Loop In/Out on source preview
  useEffect(() => {
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
  }, [activeMode, sourceUrl, clip.startSec, clip.endSec]);

  const duration = formatClipDuration(clip.startSec, clip.endSec);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="mx-auto w-full max-w-[320px] shrink-0 lg:mx-0">
        <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-border bg-black shadow-[0_0_0_1px_rgba(61,214,198,0.12)]">
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
              <video
                ref={videoRef}
                key={`soft-${sourceUrl}-${clip.startSec}-${clip.endSec}`}
                src={sourceUrl}
                controls
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
                  className={`pointer-events-none absolute h-10 w-10 object-contain ${logoCornerClass(logoCorner)}`}
                  style={{ opacity: logoOpacity }}
                />
              )}
              {caption && (
                <div className="pointer-events-none absolute inset-x-3 bottom-14 text-center">
                  <p
                    className={`${caption.sizeClass} ${caption.weight} leading-snug`}
                    style={{
                      color: caption.color,
                      WebkitTextStroke:
                        caption.stroke === "transparent"
                          ? undefined
                          : `1.5px ${caption.stroke}`,
                      paintOrder: "stroke fill",
                      textShadow:
                        caption.stroke === "transparent"
                          ? "0 1px 8px rgba(0,0,0,0.7)"
                          : undefined,
                    }}
                  >
                    {(() => {
                      const raw =
                        (clip.captionText || "").trim() ||
                        "Exemple de caption soft";
                      return raw.length > 120
                        ? `${raw.slice(0, 117)}…`
                        : raw;
                    })()}
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/90">
                Soft · {lookFilter !== "off" ? lookFilter : "natif"}
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
            className="mt-3 flex gap-1.5"
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
                    ? "cursor-pointer rounded-lg bg-signal/20 px-3 py-1.5 text-xs font-medium text-signal ring-1 ring-signal/40"
                    : "cursor-pointer rounded-lg bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                Aperçu soft
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
                    ? "cursor-pointer rounded-lg bg-signal/20 px-3 py-1.5 text-xs font-medium text-signal ring-1 ring-signal/40"
                    : "cursor-pointer rounded-lg bg-secondary/80 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                Rendu final
              </button>
            )}
          </div>
        )}
        {activeMode === "soft" && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Clique Look / Captions / Punch ci-dessous → l’aperçu change tout de
            suite. Soft ≈ navigateur ; export = Re-rendre.
            {lutHint
              ? " LUT .cube : soft approximatif, vrai grade au re-rendu."
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

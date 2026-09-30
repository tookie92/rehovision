"use client";

import { useEffect, useRef, useState } from "react";

type SceneLike = {
  order: number;
  narrationText: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  imagePrompt?: string | null;
};

type Props = {
  scene: SceneLike | null;
  sceneIndex: number;
  sceneCount: number;
  finalVideoUrl?: string | null;
  softPreview: boolean;
  imageHint?: string | null;
  voiceHint?: string | null;
};

/**
 * Stage 9:16 faceless — Soft (image scène + audio) ou Final (montage).
 */
export function StudioStagePreview({
  scene,
  sceneIndex,
  sceneCount,
  finalVideoUrl,
  softPreview,
  imageHint,
  voiceHint,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [mode, setMode] = useState<"soft" | "final">(
    softPreview || !finalVideoUrl ? "soft" : "final",
  );

  const canFinal = Boolean(finalVideoUrl);
  const canSoft = Boolean(scene);
  const activeMode =
    mode === "final" && canFinal
      ? "final"
      : canSoft
        ? "soft"
        : canFinal
          ? "final"
          : "soft";

  useEffect(() => {
    if (softPreview && canSoft) setMode("soft");
    else if (canFinal && !softPreview) setMode("final");
  }, [softPreview, canSoft, canFinal, scene?.imageUrl, finalVideoUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || activeMode !== "soft" || !scene?.audioUrl) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }, [activeMode, scene?.audioUrl, scene?.order]);

  const captionRaw = (scene?.narrationText || "").trim();
  const captionWords = captionRaw.split(/\s+/).filter(Boolean).slice(0, 12);

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

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-2">
      {modeToggle}
      <div className="phone-frame relative mx-auto aspect-[9/16] h-[min(100%,calc(100dvh-14rem))] w-auto max-w-full overflow-hidden border border-border bg-black shadow-[0_0_0_1px_rgba(61,214,198,0.12)]">
        {activeMode === "final" && finalVideoUrl ? (
          <video
            key={`final-${finalVideoUrl}`}
            src={finalVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : scene ? (
          <>
            {scene.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scene.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--background)_40%,#0a1f16)] px-4 text-center">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  SCÈNE {String(scene.order).padStart(2, "0")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {imageHint ?? "Image en attente"}
                </p>
              </div>
            )}
            {captionWords.length > 0 && (
              <div className="pointer-events-none absolute inset-x-2 bottom-14 text-center">
                <p
                  className="font-display text-[clamp(0.85rem,2.8vw,1.15rem)] font-bold leading-snug tracking-tight text-white"
                  style={{
                    textShadow:
                      "0 0 4px #000, 0 0 8px #000, 1px 1px 0 #000, -1px -1px 0 #000",
                  }}
                >
                  {captionWords.map((w, i) => (
                    <span
                      key={`${w}-${i}`}
                      className={
                        i === captionWords.length - 1
                          ? "text-signal"
                          : "text-white"
                      }
                    >
                      {w}
                      {i < captionWords.length - 1 ? " " : ""}
                    </span>
                  ))}
                </p>
              </div>
            )}
            <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-white/90">
              Soft · {sceneIndex + 1}/{sceneCount}
              {voiceHint ? ` · ${voiceHint}` : ""}
            </div>
            {scene.audioUrl && (
              <audio
                ref={audioRef}
                src={scene.audioUrl}
                preload="metadata"
                className="sr-only"
              />
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Sélectionne une scène ou lance le script
          </div>
        )}
      </div>
      {activeMode === "soft" && scene?.audioUrl && (
        <button
          type="button"
          className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) void el.play().catch(() => undefined);
            else el.pause();
          }}
        >
          Play / pause voix
        </button>
      )}
      {activeMode === "soft" && scene && !scene.audioUrl && (
        <p className="text-[11px] text-muted-foreground">
          {voiceHint ?? "Voix absente"}
          {scene.imagePrompt
            ? ` · ${scene.imagePrompt.slice(0, 48)}…`
            : ""}
        </p>
      )}
      {activeMode === "final" && finalVideoUrl && (
        <p className="font-mono text-[10px] text-muted-foreground">
          Montage final
        </p>
      )}
    </div>
  );
}

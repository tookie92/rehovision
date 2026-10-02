"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipTrimSlider } from "@/components/ClipTrimSlider";
import { formatTimecode } from "@/lib/clipStatus";
import { playbackUrl } from "@/lib/workerMedia";

type Props = {
  sourceUrl: string;
  durationSeconds?: number;
  disabled?: boolean;
  creating?: boolean;
  onCreate: (args: {
    startSec: number;
    endSec: number;
    title?: string;
  }) => Promise<void>;
};

const MIN_SEC = 3;
const MAX_SEC = 90;

/**
 * Trim manuel : preview + drag In/Out → créer un clip.
 */
export function ClipManualTrim({
  sourceUrl,
  durationSeconds,
  disabled,
  creating,
  onCreate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [inSec, setInSec] = useState(0);
  const [outSec, setOutSec] = useState(30);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const src = playbackUrl(sourceUrl);

  function seek(sec: number) {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
  }

  async function submit() {
    setError(null);
    if (!valid) {
      setError(`Sélection ${MIN_SEC}–${MAX_SEC}s requise`);
      return;
    }
    try {
      await onCreate({
        startSec: inSec,
        endSec: outSec,
        title: `Manuel ${formatTimecode(inSec)}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  const span = Math.max(0, outSec - inSec);
  const valid = span >= MIN_SEC && span <= MAX_SEC;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <video
          ref={videoRef}
          key={src}
          src={src}
          controls
          playsInline
          preload="auto"
          className="aspect-video max-h-72 w-full bg-black object-contain"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (!Number.isFinite(d) || d <= 0) return;
            setDuration(d);
            setOutSec(Math.min(30, d));
            setMediaError(null);
          }}
          onError={() =>
            setMediaError(
              "Vidéo source inaccessible — worker :8787 joignable ? Ou LAN http://IP:3000",
            )
          }
        />
      </div>
      {mediaError && (
        <p className="text-xs text-destructive" role="alert">
          {mediaError}
        </p>
      )}

      {duration > 0 && (
        <ClipTrimSlider
          duration={duration}
          inSec={inSec}
          outSec={outSec}
          currentSec={current}
          minSpan={MIN_SEC}
          maxSpan={MAX_SEC}
          disabled={disabled || creating}
          onChange={(a, b) => {
            setInSec(a);
            setOutSec(b);
            setError(null);
          }}
          onSeek={seek}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || creating}
          onClick={() => seek(inSec)}
          className="cursor-pointer"
        >
          Aller In
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || creating}
          onClick={() => seek(outSec)}
          className="cursor-pointer"
        >
          Aller Out
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || creating || !valid}
          onClick={() => void submit()}
          className="cursor-pointer"
        >
          {creating ? "Création…" : "Créer ce clip"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Glisse les poignées ({MIN_SEC}–{MAX_SEC}s). Le rendu utilise les options
        Rendu actuelles.
      </p>
    </div>
  );
}

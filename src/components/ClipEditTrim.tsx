"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipTrimSlider } from "@/components/ClipTrimSlider";

type Props = {
  sourceUrl: string;
  initialStart: number;
  initialEnd: number;
  sourceDuration?: number;
  disabled?: boolean;
  saving?: boolean;
  onSave: (args: { startSec: number; endSec: number }) => Promise<void>;
  onCancel: () => void;
};

const MIN_SEC = 3;
const MAX_SEC = 90;

/**
 * Édition In/Out d’un clip existant (drag) → re-rendu seul.
 */
export function ClipEditTrim({
  sourceUrl,
  initialStart,
  initialEnd,
  sourceDuration,
  disabled,
  saving,
  onSave,
  onCancel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(
    sourceDuration && sourceDuration > 0
      ? sourceDuration
      : Math.max(initialEnd + 1, 30),
  );
  const [inSec, setInSec] = useState(initialStart);
  const [outSec, setOutSec] = useState(initialEnd);
  const [current, setCurrent] = useState(initialStart);
  const [error, setError] = useState<string | null>(null);

  const span = outSec - inSec;
  const valid = span >= MIN_SEC && span <= MAX_SEC;

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
      await onSave({ startSec: inSec, endSec: outSec });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        Ajuster le trim
      </p>
      <div className="overflow-hidden rounded-md border border-border bg-black">
        <video
          ref={videoRef}
          src={sourceUrl}
          controls
          preload="metadata"
          className="max-h-48 w-full object-contain"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
            e.currentTarget.currentTime = initialStart;
          }}
        />
      </div>
      <ClipTrimSlider
        duration={duration}
        inSec={inSec}
        outSec={outSec}
        currentSec={current}
        minSpan={MIN_SEC}
        maxSpan={MAX_SEC}
        disabled={disabled || saving}
        onChange={(a, b) => {
          setInSec(a);
          setOutSec(b);
          setError(null);
        }}
        onSeek={seek}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || saving || !valid}
          onClick={() => void submit()}
          className="cursor-pointer"
        >
          {saving ? "Re-rendu…" : "Enregistrer & re-rendre"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
          className="cursor-pointer"
        >
          Annuler
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

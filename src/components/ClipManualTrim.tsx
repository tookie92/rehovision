"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTimecode } from "@/lib/clipStatus";

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
 * Marqueurs In/Out sur la vidéo source → crée un clip manuel.
 */
export function ClipManualTrim({
  sourceUrl,
  durationSeconds,
  disabled,
  creating,
  onCreate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inSec, setInSec] = useState(0);
  const [outSec, setOutSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);

  const duration = durationSeconds ?? videoRef.current?.duration ?? 0;
  const end = outSec ?? Math.min(inSec + 30, duration || inSec + 30);
  const span = Math.max(0, end - inSec);

  function markIn() {
    const t = videoRef.current?.currentTime ?? 0;
    setInSec(t);
    setError(null);
    if (outSec != null && outSec <= t) {
      setOutSec(null);
    }
  }

  function markOut() {
    const t = videoRef.current?.currentTime ?? 0;
    if (t <= inSec) {
      setError("Out doit être après In");
      return;
    }
    setOutSec(t);
    setError(null);
  }

  function seek(sec: number) {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
  }

  async function submit() {
    setError(null);
    if (span < MIN_SEC) {
      setError(`Min ${MIN_SEC}s — marque Out plus loin`);
      return;
    }
    if (span > MAX_SEC) {
      setError(`Max ${MAX_SEC}s — raccourcis la sélection`);
      return;
    }
    try {
      await onCreate({
        startSec: inSec,
        endSec: end,
        title: `Manuel ${formatTimecode(inSec)}`,
      });
      setOutSec(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/40 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Trim manuel
      </p>

      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <video
          ref={videoRef}
          src={sourceUrl}
          controls
          preload="metadata"
          className="max-h-64 w-full object-contain"
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && outSec == null) {
              setOutSec(Math.min(inSec + 30, d));
            }
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 timecode text-xs text-muted-foreground">
        <span>
          In{" "}
          <button
            type="button"
            className="cursor-pointer text-signal underline-offset-2 hover:underline"
            onClick={() => seek(inSec)}
          >
            {formatTimecode(inSec)}
          </button>
        </span>
        <span>
          Out{" "}
          <button
            type="button"
            className="cursor-pointer text-signal underline-offset-2 hover:underline"
            onClick={() => seek(end)}
          >
            {formatTimecode(end)}
          </button>
        </span>
        <span>
          {Math.round(span)}s
          {span < MIN_SEC || span > MAX_SEC ? " · hors limites" : ""}
        </span>
        <span className="text-muted-foreground/70">
          lecture {formatTimecode(current)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || creating}
          onClick={markIn}
          className="cursor-pointer"
        >
          Marquer In
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || creating}
          onClick={markOut}
          className="cursor-pointer"
        >
          Marquer Out
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || creating || span < MIN_SEC || span > MAX_SEC}
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
        Place la tête de lecture, marque In puis Out ({MIN_SEC}–{MAX_SEC}s),
        puis crée le clip vertical avec les options Rendu actuelles.
      </p>
    </div>
  );
}

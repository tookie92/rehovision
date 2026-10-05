"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Pause, Play } from "lucide-react";
import { cn } from "../lib/utils";
import { Progress } from "./ui/progress";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type StudioPlayerTrack = {
  url: string;
  title: string;
  subtitle?: string;
  downloadUrl?: string;
};

type Props = {
  track: StudioPlayerTrack | null;
  /** Job en file / génération */
  pending?: { label: string; progress: number } | null;
  emptyHint?: string;
  className?: string;
  trailing?: ReactNode;
};

export function StudioAudioPlayer({
  track,
  pending = null,
  emptyHint = "Aucun audio. Génère un rendu ou écoute un aperçu de voix.",
  className,
  trailing,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    const el = audioRef.current;
    if (!el || !track?.url) return;
    el.load();
    void el.play().then(() => setPlaying(true)).catch(() => undefined);
  }, [track?.url]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !track?.url) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => undefined);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function onSeek(value: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = value;
    setCurrent(value);
  }

  const hasTrack = !!track?.url;
  const max = duration > 0 ? duration : 1;

  return (
    <div
      className={cn(
        "border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]",
        className,
      )}
    >
      {track?.url && (
        <audio
          ref={audioRef}
          src={track.url}
          preload="metadata"
          onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          className="hidden"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:gap-4">
        <button
          type="button"
          disabled={!hasTrack}
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Lecture"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4 translate-x-0.5" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1 basis-[12rem]">
          {hasTrack ? (
            <>
              <p className="truncate text-sm font-semibold tracking-tight">
                {track.title}
              </p>
              {track.subtitle ? (
                <p className="truncate text-xs text-[var(--muted)]">
                  {track.subtitle}
                </p>
              ) : null}
            </>
          ) : pending ? (
            <>
              <p className="text-sm font-semibold">{pending.label}</p>
              <Progress className="mt-2 h-1.5" value={pending.progress} />
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">{emptyHint}</p>
          )}
        </div>

        {hasTrack && (
          <div className="flex min-w-0 flex-[2] basis-[14rem] items-center gap-3">
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)]">
              {formatTime(current)}
            </span>
            <input
              type="range"
              min={0}
              max={max}
              step={0.05}
              value={Math.min(current, max)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Position"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--signal)]"
            />
            <span className="w-9 shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
              {formatTime(duration)}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasTrack && track.downloadUrl && (
            <a
              href={track.downloadUrl}
              download
              className="flex size-10 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]"
              aria-label="Télécharger"
            >
              <Download className="size-4" aria-hidden />
            </a>
          )}
          {trailing}
        </div>
      </div>
    </div>
  );
}

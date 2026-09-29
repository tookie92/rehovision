"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimecode } from "@/lib/clipStatus";

type Props = {
  duration: number;
  inSec: number;
  outSec: number;
  currentSec?: number;
  minSpan?: number;
  maxSpan?: number;
  disabled?: boolean;
  onChange: (inSec: number, outSec: number) => void;
  onSeek?: (sec: number) => void;
};

type DragKind = "in" | "out" | "window" | null;

/**
 * Barre de trim avec poignées In/Out draggables + fenêtre déplaçable.
 */
export function ClipTrimSlider({
  duration,
  inSec,
  outSec,
  currentSec = 0,
  minSpan = 3,
  maxSpan = 90,
  disabled,
  onChange,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: DragKind;
    startX: number;
    origIn: number;
    origOut: number;
  } | null>(null);
  const [dragging, setDragging] = useState<DragKind>(null);

  const dur = Math.max(duration, 0.1);
  const span = Math.max(0, outSec - inSec);
  const leftPct = (inSec / dur) * 100;
  const widthPct = (span / dur) * 100;
  const playPct = Math.min(100, Math.max(0, (currentSec / dur) * 100));

  const clientToSec = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const t = (clientX - rect.left) / Math.max(rect.width, 1);
      return Math.min(dur, Math.max(0, t * dur));
    },
    [dur],
  );

  const clampPair = useCallback(
    (a: number, b: number): [number, number] => {
      let start = Math.max(0, Math.min(a, b));
      let end = Math.min(dur, Math.max(a, b));
      if (end - start < minSpan) {
        end = Math.min(dur, start + minSpan);
        if (end - start < minSpan) start = Math.max(0, end - minSpan);
      }
      if (end - start > maxSpan) {
        end = start + maxSpan;
        if (end > dur) {
          end = dur;
          start = Math.max(0, end - maxSpan);
        }
      }
      return [start, end];
    },
    [dur, minSpan, maxSpan],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || !d.kind) return;
      const sec = clientToSec(e.clientX);
      if (d.kind === "in") {
        const [, end] = clampPair(sec, d.origOut);
        const start = Math.min(sec, end - minSpan);
        onChange(...clampPair(start, end));
        onSeek?.(Math.max(0, start));
      } else if (d.kind === "out") {
        const [start] = clampPair(d.origIn, sec);
        const end = Math.max(sec, start + minSpan);
        onChange(...clampPair(start, end));
        onSeek?.(Math.min(dur, end));
      } else if (d.kind === "window") {
        const el = trackRef.current;
        if (!el) return;
        const dx = e.clientX - d.startX;
        const dSec = (dx / el.getBoundingClientRect().width) * dur;
        const w = d.origOut - d.origIn;
        let start = d.origIn + dSec;
        let end = start + w;
        if (start < 0) {
          start = 0;
          end = w;
        }
        if (end > dur) {
          end = dur;
          start = dur - w;
        }
        onChange(start, end);
      }
    }
    function onUp() {
      dragRef.current = null;
      setDragging(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [clientToSec, clampPair, dur, minSpan, onChange, onSeek]);

  function beginDrag(kind: DragKind, e: React.PointerEvent) {
    if (disabled || !kind) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind,
      startX: e.clientX,
      origIn: inSec,
      origOut: outSec,
    };
    setDragging(kind);
  }

  return (
    <div className="space-y-2">
      <div
        ref={trackRef}
        className="relative h-10 select-none rounded-md border border-border bg-secondary/40"
        onPointerDown={(e) => {
          if (disabled || dragging) return;
          if ((e.target as HTMLElement).dataset.handle) return;
          const sec = clientToSec(e.clientX);
          onSeek?.(sec);
        }}
      >
        {/* Zone sélectionnée */}
        <div
          className="absolute top-0 bottom-0 cursor-grab rounded-sm bg-signal/25 active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          onPointerDown={(e) => beginDrag("window", e)}
        />
        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground/70"
          style={{ left: `${playPct}%` }}
        />
        {/* Poignée In */}
        <button
          type="button"
          data-handle="in"
          disabled={disabled}
          aria-label="Début"
          className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm border border-signal bg-signal/80"
          style={{ left: `${leftPct}%` }}
          onPointerDown={(e) => beginDrag("in", e)}
        />
        {/* Poignée Out */}
        <button
          type="button"
          data-handle="out"
          disabled={disabled}
          aria-label="Fin"
          className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm border border-signal bg-signal/80"
          style={{ left: `${leftPct + widthPct}%` }}
          onPointerDown={(e) => beginDrag("out", e)}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 timecode text-[10px] text-muted-foreground">
        <span>
          In {formatTimecode(inSec)} → Out {formatTimecode(outSec)} ·{" "}
          {Math.round(span)}s
          {span < minSpan || span > maxSpan ? " · hors limites" : ""}
        </span>
        <span className="text-muted-foreground/70">
          glisse les poignées · fenêtre déplaçable
        </span>
      </div>
    </div>
  );
}

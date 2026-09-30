"use client";

import {
  CLIP_STATUS_LABEL,
  formatClipDuration,
  formatTimecode,
} from "@/lib/clipStatus";
import type { Id } from "@convex/_generated/dataModel";

export type FilmstripClip = {
  _id: Id<"clips">;
  order: number;
  title: string;
  startSec: number;
  endSec: number;
  status: string;
  viralScore?: number | null;
  resultUrl?: string | null;
};

type SortMode = "order" | "score";

type Props = {
  clips: FilmstripClip[];
  focusedId: Id<"clips"> | null;
  selectedIds: Set<string>;
  sort: SortMode;
  onSort: (s: SortMode) => void;
  onFocus: (id: Id<"clips">) => void;
  onToggleSelect: (id: Id<"clips">) => void;
  onSelectAll: () => void;
  onClearSelect: () => void;
};

/**
 * Liste / filmstrip — focus + multi-sélection (pas une timeline NLE).
 */
export function ClipFilmstrip({
  clips,
  focusedId,
  selectedIds,
  sort,
  onSort,
  onFocus,
  onToggleSelect,
  onSelectAll,
  onClearSelect,
}: Props) {
  const sorted = [...clips].sort((a, b) => {
    if (sort === "score") {
      return (b.viralScore ?? 0) - (a.viralScore ?? 0);
    }
    return a.order - b.order;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="atelier-label">Clips</p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onSort("order")}
            className={
              sort === "order"
                ? "cursor-pointer rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground"
                : "cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            }
          >
            Ordre
          </button>
          <button
            type="button"
            onClick={() => onSort("score")}
            className={
              sort === "score"
                ? "cursor-pointer rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground"
                : "cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            }
          >
            Score
          </button>
          <button
            type="button"
            onClick={onSelectAll}
            className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Tout
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={onClearSelect}
              className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Aucun
            </button>
          )}
        </div>
      </div>

      <ul
        className="flex gap-2 overflow-x-auto pb-1 lg:max-h-none lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0"
        role="listbox"
        aria-label="Liste des clips"
      >
        {sorted.map((clip) => {
          const focused = clip._id === focusedId;
          const checked = selectedIds.has(clip._id);
          const duration = formatClipDuration(clip.startSec, clip.endSec);
          return (
            <li key={clip._id} className="shrink-0 lg:shrink">
              <div
                className={
                  focused
                    ? "flex min-w-[200px] items-stretch gap-2 rounded-xl border border-signal/50 bg-signal/15 p-2 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--signal)_25%,transparent)] transition-all duration-200 lg:min-w-0"
                    : "flex min-w-[200px] items-stretch gap-2 rounded-xl border border-border bg-background/40 p-2 transition-all duration-200 hover:border-signal/25 lg:min-w-0"
                }
              >
                <label className="flex cursor-pointer items-center px-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleSelect(clip._id)}
                    className="size-4 accent-signal"
                    aria-label={`Sélectionner ${clip.title}`}
                  />
                </label>
                <button
                  type="button"
                  role="option"
                  aria-selected={focused}
                  onClick={() => onFocus(clip._id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold leading-snug">
                      {clip.title}
                    </p>
                    <span
                      className={
                        clip.status === "ready"
                          ? "shrink-0 font-mono text-[10px] font-medium text-signal"
                          : clip.status === "failed"
                            ? "shrink-0 font-mono text-[10px] font-medium text-destructive"
                            : "shrink-0 font-mono text-[10px] text-muted-foreground"
                      }
                    >
                      {clip.status === "ready"
                        ? "Prêt"
                        : (CLIP_STATUS_LABEL[clip.status] ?? clip.status)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {String(clip.order).padStart(2, "0")} ·{" "}
                    {formatTimecode(clip.startSec)} · {duration}
                    {typeof clip.viralScore === "number"
                      ? ` · ${Math.round(clip.viralScore)}`
                      : ""}
                  </p>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

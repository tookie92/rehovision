"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { MediaByStorage } from "./MediaByStorage";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

const TAB_HINT: Record<string, string> = {
  clips: "Le prochain rendu vertical apparaîtra ici.",
  dub: "Ta dernière voix prête se joue ici.",
  music: "Ta piste prête se joue ici.",
  audiobook: "Le livre terminé s'affiche ici.",
};

function mediaKind(job: Doc<"jobs">): "audio" | "video" {
  if (
    job.type === "clips" ||
    job.type === "clip_edit" ||
    job.type === "clip_suggest" ||
    job.type === "clip_export"
  ) {
    return "video";
  }
  return "audio";
}

function stageTitle(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  if (job.type === "music") return String(p.prompt ?? "Musique");
  if (job.type === "audiobook") {
    const title = String(p.title ?? "").trim();
    if (title) return title;
    return "Livre audio";
  }
  if (job.type === "dub" || job.type === "narration") {
    const text = String(p.text ?? "");
    if (text) return text.length > 72 ? `${text.slice(0, 72)}…` : text;
    return "Doublage";
  }
  if (job.type.startsWith("clip")) {
    return String(p.title ?? p.fileName ?? "Clip");
  }
  return job.type;
}

export function StudioStage({
  tab,
  jobs,
  loading,
}: {
  tab: string;
  jobs: Doc<"jobs">[] | undefined;
  loading: boolean;
}) {
  const ready = jobs?.find((j) => j.status === "done" && j.resultStorageId);
  const active = jobs?.find(
    (j) => j.status === "running" || j.status === "queued",
  );

  return (
    <aside
      aria-label="Prévisualisation"
      className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--stage)] text-[var(--stage-ink)] lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold tracking-tight">Aperçu</p>
        {active ? (
          <Badge
            tone="muted"
            className="border-0 bg-white/10 text-[var(--stage-ink)]"
          >
            {active.status === "running" ? "En cours" : "En file"}
          </Badge>
        ) : ready ? (
          <Badge tone="ok">Prêt</Badge>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {loading ? (
          <div className="aspect-[9/14] max-h-[400px] animate-pulse rounded-lg bg-white/10" />
        ) : ready?.resultStorageId ? (
          <>
            <p className="line-clamp-2 text-sm font-medium leading-snug text-white/90">
              {stageTitle(ready)}
            </p>
            <div className="overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10">
              <MediaByStorage
                storageId={ready.resultStorageId}
                kind={mediaKind(ready)}
                onDark
              />
            </div>
          </>
        ) : (
          <div className="flex aspect-[9/14] max-h-[360px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.04] px-5 text-center">
            <p className="text-sm font-medium text-white/85">Aucun rendu</p>
            <p className="max-w-[22ch] text-xs leading-relaxed text-white/50">
              {TAB_HINT[tab] ?? "Le prochain rendu apparaîtra ici."}
            </p>
          </div>
        )}

        {active && (
          <div className="space-y-2 rounded-lg bg-white/5 px-3 py-3">
            <p className="text-xs text-white/65">
              Un rendu à la fois · quelques minutes
            </p>
            <Progress value={active.progress ?? 8} className="bg-white/10" />
          </div>
        )}
      </div>
    </aside>
  );
}

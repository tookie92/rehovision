"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { MediaByStorage } from "./MediaByStorage";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  queued: "En file",
  running: "Génération",
  done: "Prêt",
  failed: "Erreur",
};

function jobTitle(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  if (job.type === "music") return String(p.prompt ?? "Musique");
  if (job.type === "audiobook") {
    const title = String(p.title ?? "").trim();
    if (title) return title;
    const text = String(p.text ?? "");
    return text.length > 80 ? `${text.slice(0, 80)}…` : text || "Livre audio";
  }
  if (job.type === "dub" || job.type === "narration") {
    const text = String(p.text ?? "");
    if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return p.sourceStorageId ? "Doublage audio" : "Doublage";
  }
  return job.type;
}

function jobMeta(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  const meta = job.resultMeta as Record<string, unknown> | undefined;
  if (job.type === "music") {
    const mode = p.instrumental === false ? "vocal" : "instr";
    const bpm = p.bpm != null ? ` · ${p.bpm} BPM` : "";
    return `${p.durationS ?? "?"}s · ${mode}${bpm}`;
  }
  if (job.type === "audiobook") {
    const n = meta?.chapterCount ?? "?";
    return `${p.sourceLang ?? "?"} → ${p.targetLang ?? "?"} · ${n} segment(s)`;
  }
  if (job.type === "dub" || job.type === "narration") {
    const voice =
      p.voiceMode === "keep" || p.cloneVoice === true
        ? "ma voix"
        : p.voiceMode === "create"
          ? "voix créée"
          : p.voiceMode === "model" || p.cloneVoice === false
            ? "voix modèle"
            : "voix";
    return `${p.sourceLang ?? "?"} → ${p.targetLang ?? "?"} · ${voice}`;
  }
  return job.type;
}

/** Liste générique (musique / doublage). Les clips utilisent ClipProjectsList. */
export function JobList({
  jobs,
  loading,
}: {
  jobs: Doc<"jobs">[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (!jobs?.length) {
    return (
      <p className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-sm text-[var(--muted)]">
        Aucune génération pour cette session.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {jobs.map((job) => (
        <li
          key={job._id}
          className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] transition-shadow duration-200"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{jobTitle(job)}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                <span className="uppercase tracking-wide">{job.type}</span>
                {" · "}
                {jobMeta(job)}
                {" · "}
                {new Date(job.createdAt).toLocaleString("fr-FR")}
              </p>
            </div>
            <Badge
              tone={
                job.status === "done"
                  ? "ok"
                  : job.status === "failed"
                    ? "danger"
                    : "muted"
              }
            >
              {STATUS_LABEL[job.status] ?? job.status}
            </Badge>
          </div>
          {(job.status === "running" || job.status === "queued") && (
            <Progress className="mt-3" value={job.progress ?? 0} />
          )}
          {job.status === "failed" && job.error && (
            <p className="mt-2 text-sm text-[var(--danger)]">{job.error}</p>
          )}
          {(() => {
            const meta = job.resultMeta as Record<string, unknown> | undefined;
            const spoken = typeof meta?.spokenText === "string" ? meta.spokenText : "";
            if (!spoken) return null;
            return (
              <p className="mt-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                <span className="font-medium text-[var(--ink)]">Texte lu : </span>
                {spoken.length > 280 ? `${spoken.slice(0, 280)}…` : spoken}
              </p>
            );
          })()}
          {job.status === "done" && job.resultStorageId && (
            <div className="mt-3">
              <MediaByStorage storageId={job.resultStorageId} kind="audio" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  if (job.type === "dub" || job.type === "narration") {
    const text = String(p.text ?? "");
    if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return p.sourceStorageId ? "Doublage audio" : "Doublage";
  }
  if (job.type === "clips") {
    return String(p.title ?? p.fileName ?? "Clip stub");
  }
  return job.type;
}

function jobMeta(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  if (job.type === "music") return `${p.durationS ?? "?"}s`;
  if (job.type === "dub" || job.type === "narration") {
    return `${p.sourceLang ?? "?"} → ${p.targetLang ?? "?"}`;
  }
  if (job.type === "clips") {
    return `hook ${p.hookDurationS ?? p.durationS ?? "?"}s · stub ffmpeg`;
  }
  return job.type;
}

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
          {job.status === "done" && job.resultStorageId && (
            <div className="mt-3">
              <MediaByStorage
                storageId={job.resultStorageId}
                kind={job.type === "clips" ? "video" : "audio"}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

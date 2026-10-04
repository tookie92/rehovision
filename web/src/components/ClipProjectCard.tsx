"use client";

import type { Doc, Id } from "@convex/_generated/dataModel";
import { ArrowDown } from "lucide-react";
import { ClipEditor } from "./ClipEditor";
import { ClipExportButton } from "./ClipExportButton";
import { MediaByStorage } from "./MediaByStorage";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

const STATUS_LABEL: Record<string, string> = {
  queued: "En file",
  running: "En cours",
  done: "Prêt",
  failed: "Erreur",
};

function parentTitle(job: Doc<"jobs">): string {
  const p = job.params as { title?: string; fileName?: string };
  return String(p.title ?? p.fileName ?? "Projet clip");
}

function versionTitle(job: Doc<"jobs">): string {
  const p = job.params as { title?: string; suggestion?: { title?: string } };
  if (job.type === "clip_export") {
    return String(p.title ?? "Export Reel 9:16");
  }
  if (job.type === "clip_suggest" && p.suggestion?.title) {
    return String(p.suggestion.title);
  }
  return String(p.title ?? "Version");
}

function versionKind(job: Doc<"jobs">): string {
  if (job.type === "clip_export") {
    const p = job.params as { engine?: string; captionStyle?: string };
    if (p.engine === "karaoke" || p.captionStyle === "karaoke") {
      return "Karaoke";
    }
    if (p.engine === "hyperframes" || p.engine === "hf") return "HyperFrames";
    return "Reel 9:16";
  }
  if (job.type === "clip_edit") return "Découpe manuelle";
  const sug = (job.params as { suggestion?: { kind?: string } }).suggestion;
  const map: Record<string, string> = {
    hook: "Hook",
    cut: "Coupe",
    zoom: "Zoom",
  };
  return map[sug?.kind ?? ""] ?? "Suggestion";
}

export function ClipProjectCard({
  parent,
  versions,
  sessionId,
  onVersionCreated,
}: {
  parent: Doc<"jobs">;
  versions: Doc<"jobs">[];
  sessionId: string;
  onVersionCreated?: (message: string) => void;
}) {
  const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <article className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--signal)]">
            Projet clip
          </p>
          <h3 className="mt-0.5 text-base font-semibold tracking-tight">
            {parentTitle(parent)}
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Vidéo source ·{" "}
            {new Date(parent.createdAt).toLocaleString("fr-FR")}
          </p>
        </div>
        <Badge
          tone={
            parent.status === "done"
              ? "ok"
              : parent.status === "failed"
                ? "danger"
                : "muted"
          }
        >
          {STATUS_LABEL[parent.status] ?? parent.status}
        </Badge>
      </header>

      {(parent.status === "running" || parent.status === "queued") && (
        <Progress className="mt-3" value={parent.progress ?? 0} />
      )}
      {parent.status === "failed" && parent.error && (
        <p className="mt-2 text-sm text-[var(--danger)]">{parent.error}</p>
      )}

      {parent.status === "done" && parent.resultStorageId && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[var(--muted)]">
            1 · Preview hook
          </p>
          <MediaByStorage storageId={parent.resultStorageId} kind="video" />
          <ClipExportButton
            sessionId={sessionId}
            parentJobId={parent._id}
            sourceStorageId={parent.resultStorageId}
            title={parentTitle(parent)}
            onCreated={onVersionCreated}
          />
        </div>
      )}

      {parent.status === "done" && (
        <ClipEditor
          job={parent}
          sessionId={sessionId}
          onCreated={onVersionCreated}
        />
      )}

      <div id={`clip-versions-${parent._id}`} className="mt-5 scroll-mt-4">
        <div className="mb-2 flex items-center gap-2">
          <ArrowDown className="size-3.5 text-[var(--muted)]" aria-hidden />
          <p className="text-xs font-medium text-[var(--muted)]">
            2 · Versions créées depuis cette source
            {sortedVersions.length > 0 ? ` (${sortedVersions.length})` : ""}
          </p>
        </div>

        {sortedVersions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--line-strong)] px-3 py-4 text-center text-xs text-[var(--muted)]">
            Aucune version pour l’instant. Utilise une suggestion ou la découpe
            manuelle ci-dessus.
          </p>
        ) : (
          <ul className="space-y-3 border-l-2 border-[var(--signal-soft)] pl-3 sm:pl-4">
            {sortedVersions.map((v) => (
              <li
                key={v._id}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{versionTitle(v)}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      ← depuis « {parentTitle(parent)} » · {versionKind(v)} ·{" "}
                      {new Date(v.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <Badge
                    tone={
                      v.status === "done"
                        ? "ok"
                        : v.status === "failed"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {STATUS_LABEL[v.status] ?? v.status}
                  </Badge>
                </div>
                {(v.status === "running" || v.status === "queued") && (
                  <Progress className="mt-2" value={v.progress ?? 0} />
                )}
                {v.status === "failed" && v.error && (
                  <p className="mt-2 text-sm text-[var(--danger)]">{v.error}</p>
                )}
                {v.status === "done" && v.resultStorageId && (
                  <div className="mt-2">
                    <MediaByStorage
                      storageId={v.resultStorageId as Id<"_storage">}
                      kind="video"
                    />
                    {v.type !== "clip_export" && (
                      <ClipExportButton
                        sessionId={sessionId}
                        parentJobId={parent._id}
                        sourceStorageId={v.resultStorageId as Id<"_storage">}
                        title={versionTitle(v)}
                        onCreated={onVersionCreated}
                      />
                    )}
                    {v.type === "clip_export" &&
                      (() => {
                        const meta = v.resultMeta as
                          | { captions?: boolean; cueCount?: number }
                          | undefined;
                        return (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Format 1080×1920
                            {meta?.captions
                              ? ` · ${meta.cueCount ?? 0} captions`
                              : " · sans captions"}
                          </p>
                        );
                      })()}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

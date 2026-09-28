"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardNav } from "@/components/DashboardNav";

const PROJECT_STATUS: Record<string, string> = {
  uploading: "Upload",
  downloading: "YouTube…",
  transcribing: "Whisper…",
  proposing: "Hooks…",
  rendering: "Rendu…",
  ready: "Prêt",
  failed: "Échec",
};

const CLIP_STATUS: Record<string, string> = {
  proposed: "Proposé",
  rendering: "Rendu…",
  ready: "Prêt",
  failed: "Échec",
};

export default function ClipProjectPage() {
  const params = useParams();
  const clipProjectId = params.clipProjectId as Id<"clipProjects">;
  const data = useQuery(api.clipProjects.getById, { clipProjectId });
  const retry = useMutation(api.clipProjects.retry);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function onRetry() {
    setRetryError(null);
    setRetrying(true);
    try {
      await retry({ clipProjectId });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRetrying(false);
    }
  }

  if (data === undefined) {
    return (
      <div>
        <DashboardNav />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div>
        <DashboardNav />
        <p className="text-sm text-muted-foreground">Projet introuvable.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm text-signal underline-offset-4 hover:underline"
        >
          ← Import
        </Link>
      </div>
    );
  }

  const { project, clips } = data;
  const readyCount = clips.filter((c) => c.status === "ready").length;
  const canRetry =
    project.status === "failed" &&
    Boolean(project.sourceYoutubeUrl || project.sourceVideoUrl);

  return (
    <div>
      <DashboardNav />

      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Import
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tight">
          {project.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span
            className={
              project.status === "failed"
                ? "timecode text-xs text-destructive"
                : project.status === "ready"
                  ? "timecode text-xs text-signal"
                  : "timecode text-xs text-muted-foreground"
            }
          >
            {PROJECT_STATUS[project.status] ?? project.status}
          </span>
          {project.sourceYoutubeUrl && (
            <a
              href={project.sourceYoutubeUrl}
              target="_blank"
              rel="noreferrer"
              className="max-w-[240px] truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {project.sourceYoutubeUrl}
            </a>
          )}
          {project.durationSeconds != null && (
            <span className="timecode text-xs text-muted-foreground">
              {Math.round(project.durationSeconds)}s source
            </span>
          )}
          {clips.length > 0 && (
            <span className="timecode text-xs text-muted-foreground">
              {readyCount}/{clips.length} prêts
            </span>
          )}
        </div>
        {project.errorMessage && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {project.errorMessage}
          </p>
        )}
        {canRetry && (
          <div className="mt-4 space-y-2">
            <Button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="cursor-pointer"
            >
              {retrying ? "Relance…" : "Relancer le pipeline"}
            </Button>
            {retryError && (
              <p className="text-sm text-destructive" role="alert">
                {retryError}
              </p>
            )}
          </div>
        )}
      </div>

      {project.sourceVideoUrl && (
        <div className="mb-10 overflow-hidden rounded-lg border border-border bg-black">
          <video
            src={project.sourceVideoUrl}
            controls
            className="max-h-64 w-full object-contain"
          />
        </div>
      )}

      {clips.length === 0 && project.status !== "failed" && (
        <p className="text-sm text-muted-foreground">
          Pipeline en cours — cette page se met à jour toute seule.
        </p>
      )}

      {clips.length > 0 && (
        <ul className="grid gap-10 sm:grid-cols-2">
          {clips.map((clip) => (
            <li key={clip._id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{clip.title}</p>
                  <p className="mt-1 timecode text-xs text-muted-foreground">
                    {clip.startSec.toFixed(1)}s → {clip.endSec.toFixed(1)}s
                  </p>
                </div>
                <span
                  className={
                    clip.status === "failed"
                      ? "timecode text-xs text-destructive"
                      : clip.status === "ready"
                        ? "timecode text-xs text-signal"
                        : "timecode text-xs text-muted-foreground"
                  }
                >
                  {CLIP_STATUS[clip.status] ?? clip.status}
                </span>
              </div>
              {clip.hookReason && (
                <p className="text-sm text-muted-foreground">{clip.hookReason}</p>
              )}
              {clip.errorMessage && (
                <p className="text-sm text-destructive">{clip.errorMessage}</p>
              )}
              {clip.resultUrl ? (
                <>
                  <div className="mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden rounded-2xl border border-border bg-black">
                    <video
                      src={clip.resultUrl}
                      controls
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <a
                    href={clip.resultUrl}
                    download
                    className="inline-block text-sm text-signal underline-offset-4 hover:underline"
                  >
                    Télécharger
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

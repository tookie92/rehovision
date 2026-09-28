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
import { ClipPipelineProgress } from "@/components/ClipPipelineProgress";
import { ClipRenderOptions } from "@/components/ClipRenderOptions";
import { ClipManualTrim } from "@/components/ClipManualTrim";
import {
  CLIP_STATUS_LABEL,
  formatClipDuration,
  formatTimecode,
  isPipelineActive,
  projectStatusTone,
  safeDownloadName,
} from "@/lib/clipStatus";
import type {
  CaptionStyleId,
  LayoutModeId,
  VoiceoverModeId,
} from "@/lib/renderPresets";

export default function ClipProjectPage() {
  const params = useParams();
  const clipProjectId = params.clipProjectId as Id<"clipProjects">;
  const data = useQuery(api.clipProjects.getById, { clipProjectId });
  const retry = useMutation(api.clipProjects.retry);
  const retryFailedClips = useMutation(api.clipProjects.retryFailedClips);
  const updateRenderOptions = useMutation(api.clipProjects.updateRenderOptions);
  const rerenderAll = useMutation(api.clipProjects.rerenderAll);
  const createManualClip = useMutation(api.clipProjects.createManualClip);
  const [retrying, setRetrying] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function onRetryPipeline() {
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

  async function onRetryFailed() {
    setRetryError(null);
    setRetrying(true);
    try {
      const n = await retryFailedClips({ clipProjectId });
      if (n === 0) {
        setRetryError("Aucun clip en échec à relancer");
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRetrying(false);
    }
  }

  async function persistOption(
    patch: Partial<{
      captionStyle: CaptionStyleId;
      layoutMode: LayoutModeId;
      voiceoverMode: VoiceoverModeId;
    }>,
  ) {
    setRetryError(null);
    try {
      await updateRenderOptions({ clipProjectId, ...patch });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function onApplyRerender() {
    setRetryError(null);
    setRerendering(true);
    try {
      await rerenderAll({ clipProjectId });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRerendering(false);
    }
  }

  async function onCreateManual(args: {
    startSec: number;
    endSec: number;
    title?: string;
  }) {
    setRetryError(null);
    setCreatingManual(true);
    try {
      await createManualClip({ clipProjectId, ...args });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
      throw err;
    } finally {
      setCreatingManual(false);
    }
  }

  if (data === undefined) {
    return (
      <div>
        <DashboardNav />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-28 w-full" />
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
  const failedCount = clips.filter((c) => c.status === "failed").length;
  const canRetryPipeline =
    project.status === "failed" &&
    Boolean(project.sourceYoutubeUrl || project.sourceVideoUrl);
  const canRetryFailed =
    failedCount > 0 &&
    Boolean(project.sourceVideoUrl) &&
    (project.status === "ready" || project.status === "failed");
  const hasSource = Boolean(project.sourceVideoUrl);
  const canRerender = clips.length > 0 && hasSource;

  const captionStyle = (project.captionStyle ?? "viral") as CaptionStyleId;
  const layoutMode = (project.layoutMode ?? "smart") as LayoutModeId;
  const voiceoverMode = (project.voiceoverMode ?? "off") as VoiceoverModeId;

  return (
    <div>
      <DashboardNav />

      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Import
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tight">
          {project.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {project.sourceYoutubeUrl && (
            <a
              href={project.sourceYoutubeUrl}
              target="_blank"
              rel="noreferrer"
              className="max-w-[280px] truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
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
            <span
              className={`timecode text-xs ${projectStatusTone(project.status)}`}
            >
              {readyCount}/{clips.length} prêts
              {failedCount > 0 ? ` · ${failedCount} échec` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="mb-8 space-y-4">
        <ClipPipelineProgress
          status={project.status}
          errorMessage={project.errorMessage}
          readyCount={readyCount}
          clipCount={clips.length}
        />

        {!hasSource ? (
          <div className="space-y-3 rounded-xl border border-border bg-card/40 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Rendu & trim
            </p>
            <p className="text-sm text-muted-foreground">
              Indisponibles tant qu’il n’y a pas de vidéo source. L’échec
              YouTube ci-dessus bloque tout (captions, layout, trim).
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>
                Contournement :{" "}
                <Link
                  href="/dashboard"
                  className="text-signal underline-offset-4 hover:underline"
                >
                  Import → Fichier
                </Link>{" "}
                (MP4, sans cookies)
              </li>
              <li>
                Ou configure les cookies yt-dlp sur Ubuntu (
                <code className="text-xs">worker/cookies/README.md</code>
                ), puis Relancer
              </li>
            </ul>
          </div>
        ) : (
          <>
            <ClipRenderOptions
              captionStyle={captionStyle}
              layoutMode={layoutMode}
              voiceoverMode={voiceoverMode}
              disabled={false}
              applyDisabled={!canRerender}
              saving={rerendering}
              onCaptionStyle={(v) => void persistOption({ captionStyle: v })}
              onLayoutMode={(v) => void persistOption({ layoutMode: v })}
              onVoiceoverMode={(v) => void persistOption({ voiceoverMode: v })}
              onApplyRerender={() => void onApplyRerender()}
            />
            <ClipManualTrim
              sourceUrl={project.sourceVideoUrl!}
              durationSeconds={project.durationSeconds}
              disabled={false}
              creating={creatingManual}
              onCreate={onCreateManual}
            />
          </>
        )}

        {(canRetryPipeline || canRetryFailed) && (
          <div className="flex flex-wrap gap-3">
            {canRetryPipeline && (
              <Button
                type="button"
                onClick={onRetryPipeline}
                disabled={retrying}
                className="cursor-pointer"
              >
                {retrying ? "Relance…" : "Relancer tout le pipeline"}
              </Button>
            )}
            {canRetryFailed && (
              <Button
                type="button"
                variant="outline"
                onClick={onRetryFailed}
                disabled={retrying}
                className="cursor-pointer"
              >
                {retrying
                  ? "Relance…"
                  : `Relancer ${failedCount} clip${failedCount > 1 ? "s" : ""} échoué${failedCount > 1 ? "s" : ""}`}
              </Button>
            )}
          </div>
        )}
        {retryError && (
          <p className="text-sm text-destructive" role="alert">
            {retryError}
          </p>
        )}
      </div>

      {clips.length === 0 && isPipelineActive(project.status) && (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Les clips IA apparaîtront ici dès que les hooks sont proposés. Tu
          peux déjà créer un clip manuel via Trim.
        </p>
      )}

      {clips.length === 0 && project.status === "ready" && (
        <p className="text-sm text-muted-foreground">
          Aucun clip généré — utilise le trim manuel ci-dessus.
        </p>
      )}

      {clips.length > 0 && (
        <section>
          <h2 className="mb-6 font-display text-xl">Clips</h2>
          <ul className="grid gap-10 sm:grid-cols-2">
            {clips.map((clip) => {
              const duration = formatClipDuration(clip.startSec, clip.endSec);
              return (
                <li key={clip._id} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{clip.title}</p>
                      <p className="mt-1 timecode text-xs text-muted-foreground">
                        {formatTimecode(clip.startSec)}–
                        {formatTimecode(clip.endSec)} · {duration}
                      </p>
                    </div>
                    <span
                      className={
                        clip.status === "failed"
                          ? "timecode shrink-0 text-xs text-destructive"
                          : clip.status === "ready"
                            ? "timecode shrink-0 text-xs text-signal"
                            : "timecode shrink-0 text-xs text-amber-400"
                      }
                    >
                      {(clip.status === "proposed" ||
                        clip.status === "rendering") && (
                        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
                      )}
                      {CLIP_STATUS_LABEL[clip.status] ?? clip.status}
                    </span>
                  </div>
                  {clip.hookReason && (
                    <p className="text-sm text-muted-foreground">
                      {clip.hookReason}
                    </p>
                  )}
                  {clip.errorMessage && (
                    <p className="text-sm text-destructive" role="alert">
                      {clip.errorMessage}
                    </p>
                  )}
                  {clip.resultUrl ? (
                    <>
                      <div className="mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden rounded-2xl border border-border bg-black shadow-[inset_0_0_0_1px_rgb(61_214_198_/_0.08)]">
                        <video
                          src={clip.resultUrl}
                          controls
                          preload="metadata"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <a
                        href={clip.resultUrl}
                        download={safeDownloadName(clip.title, clip.order)}
                        className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm text-signal transition-colors hover:border-signal/40"
                      >
                        Télécharger · {duration}
                      </a>
                    </>
                  ) : clip.status === "rendering" ||
                    clip.status === "proposed" ? (
                    <div className="mx-auto flex aspect-[9/16] max-h-[280px] w-full max-w-[180px] items-center justify-center rounded-2xl border border-dashed border-border bg-card/30">
                      <p className="timecode px-3 text-center text-[10px] text-muted-foreground">
                        Rendu 9:16…
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

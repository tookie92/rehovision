"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardNav } from "@/components/DashboardNav";
import { ClipPipelineProgress } from "@/components/ClipPipelineProgress";
import { ClipRenderOptions } from "@/components/ClipRenderOptions";
import { ClipManualTrim } from "@/components/ClipManualTrim";
import { ClipEditTrim } from "@/components/ClipEditTrim";
import {
  CLIP_STATUS_LABEL,
  downloadUrls,
  formatClipDuration,
  formatTimecode,
  isPipelineActive,
  projectStatusTone,
  safeDownloadName,
} from "@/lib/clipStatus";
import {
  EXPORT_PLATFORMS,
  type ExportPlatformId,
} from "@/lib/exportPresets";
import type {
  AudioEnhanceId,
  CaptionStyleId,
  LayoutModeId,
  LogoCornerId,
  PunchEffectId,
  VoiceoverModeId,
} from "@/lib/renderPresets";

export default function ClipProjectPage() {
  const params = useParams();
  const clipProjectId = params.clipProjectId as Id<"clipProjects">;
  const data = useQuery(api.clipProjects.getById, { clipProjectId });
  const retry = useMutation(api.clipProjects.retry);
  const retryFailedClips = useMutation(api.clipProjects.retryFailedClips);
  const updateRenderOptions = useMutation(api.clipProjects.updateRenderOptions);
  const generateUploadUrl = useMutation(api.clipProjects.generateUploadUrl);
  const setLogoAsset = useMutation(api.clipProjects.setLogoAsset);
  const setMusicAsset = useMutation(api.clipProjects.setMusicAsset);
  const rerenderAll = useMutation(api.clipProjects.rerenderAll);
  const createManualClip = useMutation(api.clipProjects.createManualClip);
  const updateClipTrim = useMutation(api.clipProjects.updateClipTrim);
  const [retrying, setRetrying] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [editingClipId, setEditingClipId] = useState<Id<"clips"> | null>(null);
  const [savingTrim, setSavingTrim] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [exportPlatform, setExportPlatform] =
    useState<ExportPlatformId>("reels");

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
      audioEnhance: AudioEnhanceId;
      punchEffect: PunchEffectId;
      logoCorner: LogoCornerId;
      logoOpacity: number;
      musicVolume: number;
      clearLogo: boolean;
      clearMusic: boolean;
    }>,
  ) {
    setRetryError(null);
    try {
      await updateRenderOptions({ clipProjectId, ...patch });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Logo : PNG/JPG/WebP");
    }
    const uploadUrl = await generateUploadUrl({});
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload logo (${res.status})`);
    const { storageId } = (await res.json()) as { storageId: string };
    await setLogoAsset({
      clipProjectId,
      storageId: storageId as never,
    });
  }

  async function uploadMusic(file: File) {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a)$/i.test(file.name)) {
      throw new Error("Musique : MP3/WAV");
    }
    const uploadUrl = await generateUploadUrl({});
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "audio/mpeg" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload musique (${res.status})`);
    const { storageId } = (await res.json()) as { storageId: string };
    await setMusicAsset({
      clipProjectId,
      storageId: storageId as never,
    });
  }

  async function onApplyRerender() {
    setRetryError(null);
    setApplyInfo(null);
    setRerendering(true);
    try {
      const n = await rerenderAll({ clipProjectId });
      setApplyInfo(
        n > 0
          ? `${n} clip${n > 1 ? "s" : ""} mis en file — le worker les reprend.`
          : "Aucun clip à re-rendre",
      );
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

  async function onSaveClipTrim(
    clipId: Id<"clips">,
    args: { startSec: number; endSec: number },
  ) {
    setRetryError(null);
    setSavingTrim(true);
    try {
      await updateClipTrim({ clipId, ...args });
      setEditingClipId(null);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
      throw err;
    } finally {
      setSavingTrim(false);
    }
  }

  if (data === undefined) {
    return (
      <div>
        <DashboardNav />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-28 w-full rounded-2xl" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="aspect-[9/16] max-h-[360px] rounded-2xl" />
          <Skeleton className="aspect-[9/16] max-h-[360px] rounded-2xl" />
          <Skeleton className="aspect-[9/16] max-h-[360px] rounded-2xl" />
        </div>
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
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal hover:underline"
        >
          <ArrowLeft className="size-4" weight="bold" />
          Retour aux projets
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
  const pipelineBusy = isPipelineActive(project.status);

  const captionStyle = (project.captionStyle ?? "viral") as CaptionStyleId;
  const layoutMode = (project.layoutMode ?? "smart") as LayoutModeId;
  const voiceoverMode = (project.voiceoverMode ?? "off") as VoiceoverModeId;
  const audioEnhance = (project.audioEnhance ?? "off") as AudioEnhanceId;
  const punchEffect = (project.punchEffect ?? "off") as PunchEffectId;
  const logoCorner = (project.logoCorner ?? "br") as LogoCornerId;
  const logoOpacity = project.logoOpacity ?? 0.85;
  const musicVolume = project.musicVolume ?? 0.18;

  return (
    <div>
      <DashboardNav />

      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" weight="bold" />
          Projets
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {project.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {project.sourceYoutubeUrl && (
                <a
                  href={project.sourceYoutubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[240px] truncate underline-offset-4 hover:underline"
                >
                  YouTube
                </a>
              )}
              {project.durationSeconds != null && (
                <span>{Math.round(project.durationSeconds)}s source</span>
              )}
              {clips.length > 0 && (
                <span className={projectStatusTone(project.status)}>
                  {readyCount}/{clips.length} prêts
                  {failedCount > 0 ? ` · ${failedCount} échec` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {(pipelineBusy || project.status === "failed" || clips.length === 0) && (
        <div className="mb-8">
          <ClipPipelineProgress
            status={project.status}
            errorMessage={project.errorMessage}
            readyCount={readyCount}
            clipCount={clips.length}
          />
        </div>
      )}

      {(canRetryPipeline || canRetryFailed) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {canRetryPipeline && (
            <Button
              type="button"
              onClick={onRetryPipeline}
              disabled={retrying}
              className="cursor-pointer"
            >
              {retrying ? "Relance…" : "Relancer"}
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
                : `Relancer ${failedCount} clip${failedCount > 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      )}

      {retryError && (
        <p
          className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {retryError}
        </p>
      )}

      {/* Clips d’abord — cœur Opus + export Viblo */}
      <section className="mb-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {clips.length > 0
              ? `Clips (${clips.length})`
              : pipelineBusy
                ? "Clips en préparation"
                : "Clips"}
          </h2>
          {readyCount > 0 && (
            <p className="text-xs font-medium text-signal">
              {readyCount} prêt{readyCount > 1 ? "s" : ""} à poster
            </p>
          )}
        </div>

        {readyCount > 0 && (
          <div className="mb-6 space-y-3 rounded-2xl border border-signal/30 bg-signal/5 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Export</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choisis la plateforme — le fichier est nommé pour l’upload
                  direct.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  const plat =
                    EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)
                      ?.fileSlug ?? exportPlatform;
                  const items = clips
                    .filter((c) => c.resultUrl && c.status === "ready")
                    .map((c) => ({
                      url: c.resultUrl!,
                      filename: safeDownloadName(c.title, c.order, plat),
                    }));
                  downloadUrls(items);
                }}
              >
                <DownloadSimple className="size-4" weight="bold" />
                Tout télécharger ({readyCount})
              </Button>
            </div>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Plateforme d’export"
            >
              {EXPORT_PLATFORMS.map((p) => {
                const active = p.id === exportPlatform;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={p.hint}
                    onClick={() => setExportPlatform(p.id)}
                    className={
                      active
                        ? "cursor-pointer rounded-lg bg-signal/20 px-3 py-1.5 text-sm font-medium text-signal ring-1 ring-signal/40"
                        : "cursor-pointer rounded-lg bg-secondary/80 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {clips.length === 0 && pipelineBusy && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              Les clips apparaissent ici dès que l’IA a trouvé les moments forts.
            </p>
          </div>
        )}

        {clips.length === 0 && project.status === "ready" && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun clip auto. Ouvre les outils ci-dessous pour un trim manuel.
            </p>
          </div>
        )}

        {clips.length === 0 && project.status === "failed" && !hasSource && (
          <div className="rounded-2xl border border-border bg-card/40 px-5 py-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Pas de vidéo source</p>
            <p className="mt-2">
              Importe un{" "}
              <Link
                href="/dashboard"
                className="text-signal underline-offset-4 hover:underline"
              >
                fichier MP4
              </Link>{" "}
              (plus fiable que YouTube sans cookies).
            </p>
          </div>
        )}

        {clips.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((clip) => {
              const duration = formatClipDuration(clip.startSec, clip.endSec);
              return (
                <li
                  key={clip._id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/40"
                >
                  {clip.resultUrl ? (
                    <div className="aspect-[9/16] max-h-[420px] bg-black">
                      <video
                        src={clip.resultUrl}
                        controls
                        preload="metadata"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : clip.status === "rendering" ||
                    clip.status === "proposed" ? (
                    <div className="flex aspect-[9/16] max-h-[280px] items-center justify-center bg-secondary/30">
                      <p className="text-xs text-muted-foreground">
                        Rendu 9:16…
                      </p>
                    </div>
                  ) : (
                    <div className="flex aspect-[9/16] max-h-[200px] items-center justify-center bg-secondary/20">
                      <p className="text-xs text-muted-foreground">Pas encore</p>
                    </div>
                  )}

                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">
                        {clip.title}
                      </p>
                      <span
                        className={
                          clip.status === "failed"
                            ? "shrink-0 text-[11px] font-medium text-destructive"
                            : clip.status === "ready"
                              ? "shrink-0 rounded-md bg-signal/15 px-1.5 py-0.5 text-[11px] font-medium text-signal"
                              : "shrink-0 text-[11px] font-medium text-amber-400"
                        }
                      >
                        {clip.status === "ready"
                          ? "Prêt à poster"
                          : (CLIP_STATUS_LABEL[clip.status] ?? clip.status)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTimecode(clip.startSec)}–
                      {formatTimecode(clip.endSec)} · {duration}
                    </p>
                    {clip.hookReason && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {clip.hookReason}
                      </p>
                    )}
                    {clip.errorMessage && (
                      <p className="text-xs text-destructive" role="alert">
                        {clip.errorMessage}
                      </p>
                    )}

                    {hasSource &&
                      editingClipId === clip._id &&
                      project.sourceVideoUrl && (
                        <ClipEditTrim
                          sourceUrl={project.sourceVideoUrl}
                          initialStart={clip.startSec}
                          initialEnd={clip.endSec}
                          sourceDuration={project.durationSeconds}
                          saving={savingTrim}
                          onSave={(args) => onSaveClipTrim(clip._id, args)}
                          onCancel={() => setEditingClipId(null)}
                        />
                      )}

                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {clip.resultUrl && (
                        <a
                          href={clip.resultUrl}
                          download={safeDownloadName(
                            clip.title,
                            clip.order,
                            EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)
                              ?.fileSlug ?? exportPlatform,
                          )}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                        >
                          <DownloadSimple className="size-4" weight="bold" />
                          Télécharger
                        </a>
                      )}
                      {hasSource && editingClipId !== clip._id && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={clip.status === "rendering"}
                          onClick={() => setEditingClipId(clip._id)}
                          className="cursor-pointer"
                        >
                          Ajuster
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Outils secondaires — Appliquer toujours visible (sinon options sauvées sans jobs) */}
      {hasSource && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Appliquer le polish
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Les réglages ci-dessous sont enregistrés tout de suite. Clique
                ici pour mettre les clips en file de rendu.
              </p>
            </div>
            <Button
              type="button"
              disabled={!canRerender || rerendering}
              onClick={() => void onApplyRerender()}
              className="shrink-0 cursor-pointer"
            >
              {rerendering
                ? "Mise en file…"
                : canRerender
                  ? `Re-rendre ${clips.length} clip${clips.length > 1 ? "s" : ""}`
                  : "Pas de clip à rendre"}
            </Button>
          </div>
          {applyInfo && (
            <p className="text-sm text-signal" role="status">
              {applyInfo}
            </p>
          )}

          <ClipRenderOptions
            captionStyle={captionStyle}
            layoutMode={layoutMode}
            voiceoverMode={voiceoverMode}
            audioEnhance={audioEnhance}
            punchEffect={punchEffect}
            logoUrl={project.logoUrl}
            logoCorner={logoCorner}
            logoOpacity={logoOpacity}
            musicUrl={project.musicUrl}
            musicVolume={musicVolume}
            disabled={false}
            applyDisabled={!canRerender}
            saving={rerendering}
            defaultOpen={false}
            hideApply
            onCaptionStyle={(v) => void persistOption({ captionStyle: v })}
            onLayoutMode={(v) => void persistOption({ layoutMode: v })}
            onVoiceoverMode={(v) => void persistOption({ voiceoverMode: v })}
            onAudioEnhance={(v) => void persistOption({ audioEnhance: v })}
            onPunchEffect={(v) => void persistOption({ punchEffect: v })}
            onLogoCorner={(v) => void persistOption({ logoCorner: v })}
            onLogoOpacity={(v) => void persistOption({ logoOpacity: v })}
            onMusicVolume={(v) => void persistOption({ musicVolume: v })}
            onUploadLogo={async (f) => {
              try {
                await uploadLogo(f);
              } catch (err) {
                setRetryError(err instanceof Error ? err.message : "Erreur");
              }
            }}
            onClearLogo={() => void persistOption({ clearLogo: true })}
            onUploadMusic={async (f) => {
              try {
                await uploadMusic(f);
              } catch (err) {
                setRetryError(err instanceof Error ? err.message : "Erreur");
              }
            }}
            onClearMusic={() => void persistOption({ clearMusic: true })}
            onApplyRerender={() => void onApplyRerender()}
          />

          <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
            <button
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/40"
              aria-expanded={toolsOpen}
            >
              <div>
                <p className="text-sm font-semibold">Créer un clip manuel</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choisis In / Out sur la timeline source
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {toolsOpen ? "Fermer" : "Ouvrir"}
              </span>
            </button>
            {toolsOpen && (
              <div className="border-t border-border px-4 py-4">
                <ClipManualTrim
                  sourceUrl={project.sourceVideoUrl!}
                  durationSeconds={project.durationSeconds}
                  disabled={false}
                  creating={creatingManual}
                  onCreate={onCreateManual}
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

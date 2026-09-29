"use client";

import { useEffect, useState } from "react";
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
import { ClipFilmstrip } from "@/components/ClipFilmstrip";
import { ClipStagePreview } from "@/components/ClipStagePreview";
import {
  downloadUrls,
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
  LookFilterId,
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
  const setLutAsset = useMutation(api.clipProjects.setLutAsset);
  const rerenderAll = useMutation(api.clipProjects.rerenderAll);
  const rerenderClips = useMutation(api.clipProjects.rerenderClips);
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
  const [focusedClipId, setFocusedClipId] = useState<Id<"clips"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"order" | "score">("score");
  const [preferSoft, setPreferSoft] = useState(true);

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
      lookFilter: LookFilterId;
      logoCorner: LogoCornerId;
      logoOpacity: number;
      musicVolume: number;
      clearLogo: boolean;
      clearMusic: boolean;
      clearLut: boolean;
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

  async function uploadLut(file: File) {
    if (!/\.cube$/i.test(file.name)) {
      throw new Error("LUT : fichier .cube (DaVinci / Resolve)");
    }
    const uploadUrl = await generateUploadUrl({});
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload LUT (${res.status})`);
    const { storageId } = (await res.json()) as { storageId: string };
    await setLutAsset({
      clipProjectId,
      storageId: storageId as never,
    });
  }

  async function onApplyRerender() {
    setRetryError(null);
    setApplyInfo(null);
    setRerendering(true);
    try {
      let n: number;
      if (selectedIds.size > 0) {
        n = await rerenderClips({
          clipProjectId,
          clipIds: [...selectedIds] as Id<"clips">[],
        });
      } else {
        n = await rerenderAll({ clipProjectId });
      }
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

  const clipsForFocus = data?.clips ?? [];
  useEffect(() => {
    if (clipsForFocus.length === 0) {
      setFocusedClipId(null);
      return;
    }
    if (
      !focusedClipId ||
      !clipsForFocus.some((c) => c._id === focusedClipId)
    ) {
      const best = [...clipsForFocus].sort(
        (a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0),
      )[0];
      setFocusedClipId(best?._id ?? clipsForFocus[0]!._id);
    }
  }, [clipsForFocus, focusedClipId]);

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
  const lookFilter = (project.lookFilter ?? "off") as LookFilterId;
  const logoCorner = (project.logoCorner ?? "br") as LogoCornerId;
  const logoOpacity = project.logoOpacity ?? 0.85;
  const musicVolume = project.musicVolume ?? 0.18;

  const focusedClip =
    clips.find((c) => c._id === focusedClipId) ?? clips[0] ?? null;

  const selectedReady = clips.filter(
    (c) => selectedIds.has(c._id) && c.resultUrl && c.status === "ready",
  );

  function toggleSelect(id: Id<"clips">) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      {/* Atelier : filmstrip + stage 9:16 (preview soft avant rendu) */}
      <section className="mb-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {clips.length > 0
              ? `Clips (${clips.length})`
              : pipelineBusy
                ? "Clips en préparation"
                : "Clips"}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {readyCount > 0 && (
              <p className="text-xs font-medium text-signal">
                {readyCount} prêt{readyCount > 1 ? "s" : ""} à poster
              </p>
            )}
            {clips.length > 0 && hasSource && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={preferSoft}
                  onChange={(e) => setPreferSoft(e.target.checked)}
                  className="size-3.5 accent-signal"
                />
                Préférer aperçu soft
              </label>
            )}
          </div>
        </div>

        {readyCount > 0 && (
          <div className="mb-6 space-y-3 rounded-2xl border border-signal/30 bg-signal/5 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Export</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedReady.length > 0
                    ? `${selectedReady.length} sélectionné${selectedReady.length > 1 ? "s" : ""} prêts`
                    : "Choisis la plateforme — ou coche des clips dans la liste"}
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
                  const pool =
                    selectedReady.length > 0
                      ? selectedReady
                      : clips.filter(
                          (c) => c.resultUrl && c.status === "ready",
                        );
                  const items = pool.map((c) => ({
                    url: c.resultUrl!,
                    filename: safeDownloadName(c.title, c.order, plat),
                  }));
                  downloadUrls(items);
                }}
              >
                <DownloadSimple className="size-4" weight="bold" />
                {selectedReady.length > 0
                  ? `Télécharger (${selectedReady.length})`
                  : `Tout télécharger (${readyCount})`}
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

        {clips.length > 0 && focusedClip && (
          <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <ClipFilmstrip
              clips={clips}
              focusedId={focusedClipId}
              selectedIds={selectedIds}
              sort={sortMode}
              onSort={setSortMode}
              onFocus={(id) => {
                setFocusedClipId(id);
                setEditingClipId(null);
              }}
              onToggleSelect={toggleSelect}
              onSelectAll={() =>
                setSelectedIds(new Set(clips.map((c) => c._id)))
              }
              onClearSelect={() => setSelectedIds(new Set())}
            />

            <div className="space-y-4 rounded-2xl border border-border bg-card/30 p-4 md:p-5">
              <ClipStagePreview
                clip={focusedClip}
                sourceUrl={project.sourceVideoUrl}
                softPreview={preferSoft}
                captionStyle={captionStyle}
                lookFilter={lookFilter}
                punchEffect={punchEffect}
                logoUrl={project.logoUrl}
                logoCorner={logoCorner}
                logoOpacity={logoOpacity}
                editing={editingClipId === focusedClip._id}
                editSlot={
                  hasSource &&
                  editingClipId === focusedClip._id &&
                  project.sourceVideoUrl ? (
                    <ClipEditTrim
                      sourceUrl={project.sourceVideoUrl}
                      initialStart={focusedClip.startSec}
                      initialEnd={focusedClip.endSec}
                      sourceDuration={project.durationSeconds}
                      saving={savingTrim}
                      onSave={(args) =>
                        onSaveClipTrim(focusedClip._id, args)
                      }
                      onCancel={() => setEditingClipId(null)}
                    />
                  ) : null
                }
              />

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {focusedClip.resultUrl && (
                  <a
                    href={focusedClip.resultUrl}
                    download={safeDownloadName(
                      focusedClip.title,
                      focusedClip.order,
                      EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)
                        ?.fileSlug ?? exportPlatform,
                    )}
                    className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    <DownloadSimple className="size-4" weight="bold" />
                    Télécharger
                  </a>
                )}
                {hasSource && editingClipId !== focusedClip._id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={focusedClip.status === "rendering"}
                    onClick={() => setEditingClipId(focusedClip._id)}
                    className="h-10 cursor-pointer"
                  >
                    Ajuster In/Out
                  </Button>
                )}
                {hasSource && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={
                      rerendering || focusedClip.status === "rendering"
                    }
                    onClick={() => {
                      setSelectedIds(new Set([focusedClip._id]));
                      void (async () => {
                        setRetryError(null);
                        setApplyInfo(null);
                        setRerendering(true);
                        try {
                          const n = await rerenderClips({
                            clipProjectId,
                            clipIds: [focusedClip._id],
                          });
                          setApplyInfo(
                            n > 0
                              ? "1 clip mis en file — rendu ffmpeg."
                              : "Rien à rendre",
                          );
                        } catch (err) {
                          setRetryError(
                            err instanceof Error ? err.message : "Erreur",
                          );
                        } finally {
                          setRerendering(false);
                        }
                      })();
                    }}
                    className="h-10 cursor-pointer"
                  >
                    Re-rendre ce clip
                  </Button>
                )}
              </div>
            </div>
          </div>
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
                Soft preview = immédiat. Ce bouton lance le vrai rendu ffmpeg
                {selectedIds.size > 0
                  ? ` (${selectedIds.size} sélectionné${selectedIds.size > 1 ? "s" : ""})`
                  : " (tous les clips)"}
                .
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
                : !canRerender
                  ? "Pas de clip à rendre"
                  : selectedIds.size > 0
                    ? `Re-rendre ${selectedIds.size}`
                    : `Re-rendre ${clips.length} clip${clips.length > 1 ? "s" : ""}`}
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
            lookFilter={lookFilter}
            lutUrl={project.lutUrl}
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
            onLookFilter={(v) => void persistOption({ lookFilter: v })}
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
            onUploadLut={async (f) => {
              try {
                await uploadLut(f);
              } catch (err) {
                setRetryError(err instanceof Error ? err.message : "Erreur");
              }
            }}
            onClearLut={() => void persistOption({ clearLut: true })}
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeft, DownloadSimple, ShareNetwork, Stack } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipPipelineProgress } from "@/components/ClipPipelineProgress";
import { ClipRenderOptions } from "@/components/ClipRenderOptions";
import { ClipManualTrim } from "@/components/ClipManualTrim";
import { ClipEditTrim } from "@/components/ClipEditTrim";
import { ClipFilmstrip } from "@/components/ClipFilmstrip";
import { ClipStagePreview } from "@/components/ClipStagePreview";
import { SplitFrameDialog } from "@/components/SplitFrameDialog";
import { SmartFrameDialog } from "@/components/SmartFrameDialog";
import {
  downloadUrl,
  downloadUrls,
  isPipelineActive,
  projectStatusTone,
  safeDownloadName,
} from "@/lib/clipStatus";
import { shareOrCopyMedia } from "@/lib/shareMedia";
import { buildLutPackCube, type LutPackId } from "@/lib/lutCubes";
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
  SplitFocusPane,
  VoiceoverModeId,
} from "@/lib/renderPresets";
import {
  DEFAULT_SMART_FOCUS,
  DEFAULT_SPLIT_FOCUS_BOT,
  DEFAULT_SPLIT_FOCUS_TOP,
} from "@/lib/renderPresets";

/**
 * Atelier Opus-like : 1 viewport (clips | stage | outils | barre In/Out).
 * Pas de scroll de page — scroll uniquement dans les panneaux.
 */
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
  const stitchClips = useMutation(api.clipProjects.stitchClips);
  const enqueuePostMeta = useMutation(api.clipProjects.enqueuePostMeta);
  const [retrying, setRetrying] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [editingClipId, setEditingClipId] = useState<Id<"clips"> | null>(null);
  const [savingTrim, setSavingTrim] = useState(false);
  const [postMetaBusy, setPostMetaBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [exportPlatform, setExportPlatform] =
    useState<ExportPlatformId>("reels");
  const [focusedClipId, setFocusedClipId] = useState<Id<"clips"> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"order" | "score">("score");
  const [preferSoft, setPreferSoft] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [localFocusTop, setLocalFocusTop] = useState<SplitFocusPane | null>(
    null,
  );
  const [localFocusBot, setLocalFocusBot] = useState<SplitFocusPane | null>(
    null,
  );
  const [localSmartFocus, setLocalSmartFocus] =
    useState<SplitFocusPane | null>(null);
  const [splitFrameOpen, setSplitFrameOpen] = useState(false);
  const [smartFrameOpen, setSmartFrameOpen] = useState(false);

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
      splitSwap: boolean;
      splitFocusTop: SplitFocusPane;
      splitFocusBot: SplitFocusPane;
      clearSplitFocus: boolean;
      smartFocus: SplitFocusPane;
      clearSmartFocus: boolean;
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
    setPreferSoft(true);
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

  async function applyLutPack(packId: LutPackId) {
    const cube = buildLutPackCube(packId);
    const file = new File([cube], `rehovision-${packId}.cube`, {
      type: "application/octet-stream",
    });
    await uploadLut(file);
  }

  async function onShareMedia(url: string, title: string) {
    setRetryError(null);
    const result = await shareOrCopyMedia({ url, title });
    if (!result.ok) {
      if (result.reason !== "Annulé") setRetryError(result.reason);
      return;
    }
    setApplyInfo(
      result.mode === "clipboard"
        ? "Lien copié — colle dans TikTok / Reels"
        : "Partage ouvert",
    );
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
          ? `${n} clip${n > 1 ? "s" : ""} mis en file — Soft off, Final dès que prêt.`
          : "Aucun clip à re-rendre",
      );
      // Étape 0 : regarder le MP4 Final, pas la source Soft lourde
      if (n > 0) setPreferSoft(false);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRerendering(false);
    }
  }

  async function onStitchSelected(clipIds: Id<"clips">[]) {
    setRetryError(null);
    setApplyInfo(null);
    setStitching(true);
    try {
      await stitchClips({ clipProjectId, clipIds });
      setApplyInfo(
        `Assemblage de ${clipIds.length} clips en file — soft preview puis export.`,
      );
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setStitching(false);
    }
  }

  async function onExportReady(
    pool: Array<{ resultUrl: string; title: string; order: number }>,
  ) {
    if (pool.length === 0) return;
    const plat =
      EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)?.fileSlug ??
      exportPlatform;
    setRetryError(null);
    setApplyInfo(null);
    setDownloading(true);
    try {
      await downloadUrls(
        pool.map((c) => ({
          url: c.resultUrl,
          filename: safeDownloadName(c.title, c.order, plat),
        })),
      );
      setApplyInfo(
        pool.length === 1
          ? "Téléchargement lancé"
          : `${pool.length} fichiers téléchargés`,
      );
    } catch (err) {
      setRetryError(
        err instanceof Error ? err.message : "Téléchargement échoué",
      );
    } finally {
      setDownloading(false);
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
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[70vh] w-full rounded-xl" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="p-6">
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

  const { project, clips, stitches } = data;
  const latestStitch = stitches[0] ?? null;
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
  const splitSwap = Boolean(project.splitSwap);
  const splitFocusTop =
    localFocusTop ??
    (project.splitFocusTop as SplitFocusPane | undefined) ??
    null;
  const splitFocusBot =
    localFocusBot ??
    (project.splitFocusBot as SplitFocusPane | undefined) ??
    null;
  const smartFocus =
    localSmartFocus ??
    (project.smartFocus as SplitFocusPane | undefined) ??
    null;
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
  /** Ordre stitch = tri filmstrip courant (Ordre / Score). */
  const stitchQueue = [...selectedReady].sort((a, b) => {
    if (sortMode === "score") {
      return (b.viralScore ?? 0) - (a.viralScore ?? 0);
    }
    return a.order - b.order;
  });
  const canStitch = stitchQueue.length >= 2 && stitchQueue.length <= 3;
  const stitchTotalSec = stitchQueue.reduce(
    (sum, c) => sum + Math.max(0, c.endSec - c.startSec),
    0,
  );

  function toggleSelect(id: Id<"clips">) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const renderOptionsProps = {
    captionStyle,
    layoutMode,
    splitSwap,
    voiceoverMode,
    audioEnhance,
    punchEffect,
    lookFilter,
    lutUrl: project.lutUrl,
    logoUrl: project.logoUrl,
    logoCorner,
    logoOpacity,
    musicUrl: project.musicUrl,
    musicVolume,
    disabled: false,
    applyDisabled: !canRerender,
    saving: rerendering,
    hideApply: true as const,
    onCaptionStyle: (v: CaptionStyleId) => void persistOption({ captionStyle: v }),
    onLayoutMode: (v: LayoutModeId) => void persistOption({ layoutMode: v }),
    onSplitSwap: (v: boolean) => void persistOption({ splitSwap: v }),
    onOpenSplitFrame: () => {
      if (!project.sourceVideoUrl) return;
      setPreferSoft(true);
      setSplitFrameOpen(true);
    },
    onClearSplitFocus: () => {
      setLocalFocusTop(null);
      setLocalFocusBot(null);
      void persistOption({ clearSplitFocus: true });
    },
    hasManualSplitFocus: Boolean(
      project.splitFocusTop ||
        project.splitFocusBot ||
        localFocusTop ||
        localFocusBot,
    ),
    onOpenSmartFrame: () => {
      if (!project.sourceVideoUrl) return;
      setPreferSoft(true);
      setSmartFrameOpen(true);
    },
    onClearSmartFocus: () => {
      setLocalSmartFocus(null);
      void persistOption({ clearSmartFocus: true });
    },
    hasManualSmartFocus: Boolean(project.smartFocus || localSmartFocus),
    onVoiceoverMode: (v: VoiceoverModeId) =>
      void persistOption({ voiceoverMode: v }),
    onAudioEnhance: (v: AudioEnhanceId) =>
      void persistOption({ audioEnhance: v }),
    onPunchEffect: (v: PunchEffectId) => void persistOption({ punchEffect: v }),
    onLookFilter: (v: LookFilterId) => void persistOption({ lookFilter: v }),
    onLogoCorner: (v: LogoCornerId) => void persistOption({ logoCorner: v }),
    onLogoOpacity: (v: number) => void persistOption({ logoOpacity: v }),
    onMusicVolume: (v: number) => void persistOption({ musicVolume: v }),
    onPreviewIntent: () => setPreferSoft(true),
    onUploadLogo: async (f: File) => {
      try {
        setPreferSoft(true);
        await uploadLogo(f);
      } catch (err) {
        setRetryError(err instanceof Error ? err.message : "Erreur");
      }
    },
    onClearLogo: () => void persistOption({ clearLogo: true }),
    onUploadMusic: async (f: File) => {
      try {
        await uploadMusic(f);
      } catch (err) {
        setRetryError(err instanceof Error ? err.message : "Erreur");
      }
    },
    onClearMusic: () => void persistOption({ clearMusic: true }),
    onUploadLut: async (f: File) => {
      try {
        setPreferSoft(true);
        await uploadLut(f);
      } catch (err) {
        setRetryError(err instanceof Error ? err.message : "Erreur");
      }
    },
    onApplyLutPack: async (packId: LutPackId) => {
      setPreferSoft(true);
      await applyLutPack(packId);
    },
    onClearLut: () => void persistOption({ clearLut: true }),
    onApplyRerender: () => void onApplyRerender(),
  };

  // Pipeline / empty : layout simple (pas encore d’atelier)
  if (clips.length === 0 || pipelineBusy) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" weight="bold" />
          Projets
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
        <ClipPipelineProgress
          status={project.status}
          errorMessage={project.errorMessage}
          readyCount={readyCount}
          clipCount={clips.length}
        />
        {(canRetryPipeline || canRetryFailed) && (
          <div className="flex flex-wrap gap-3">
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
                Relancer les échecs
              </Button>
            )}
          </div>
        )}
        {hasSource && project.status === "ready" && clips.length === 0 && (
          <ClipManualTrim
            sourceUrl={project.sourceVideoUrl!}
            durationSeconds={project.durationSeconds}
            disabled={false}
            creating={creatingManual}
            onCreate={onCreateManual}
          />
        )}
        {retryError && (
          <p className="text-sm text-destructive" role="alert">
            {retryError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-atelier-workspace
      className="atelier-grain fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background"
    >
      {/* Chrome atelier compact */}
      <header className="relative z-[1] flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-card/40 px-3 backdrop-blur-md md:px-4">
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" weight="bold" />
          Projets
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-sm tracking-tight">
            {project.title}
          </h1>
        </div>
        <span
          className={`shrink-0 font-mono text-[11px] tabular-nums ${projectStatusTone(project.status)}`}
        >
          {readyCount}/{clips.length} prêts
        </span>
        <label
          className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-border/80 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground sm:flex"
          title="Soft = aperçu source (lent). Décoche dès qu’un Final existe. Coche seulement pour juger look/captions avant Re-rendre."
        >
          <input
            type="checkbox"
            checked={preferSoft}
            onChange={(e) => setPreferSoft(e.target.checked)}
            className="size-3 accent-signal"
          />
          Soft
        </label>
        {readyCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={downloading}
            className="hidden h-9 cursor-pointer border-signal/30 sm:inline-flex"
            onClick={() => {
              const pool =
                selectedReady.length > 0
                  ? selectedReady
                  : clips.filter((c) => c.resultUrl && c.status === "ready");
              void onExportReady(
                pool.map((c) => ({
                  resultUrl: c.resultUrl!,
                  title: c.title,
                  order: c.order,
                })),
              );
            }}
          >
            <DownloadSimple className="size-3.5" weight="bold" />
            {downloading
              ? "…"
              : selectedReady.length > 0
                ? `Export (${selectedReady.length})`
                : `Export (${readyCount})`}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!canRerender || rerendering}
          onClick={() => void onApplyRerender()}
          className="cta-signal h-9 shrink-0 cursor-pointer border-0 px-4 shadow-[0_10px_28px_-10px_color-mix(in_oklab,var(--signal)_60%,transparent)] hover:bg-signal"
        >
          {rerendering
            ? "File…"
            : selectedIds.size > 0
              ? `Re-rendre ${selectedIds.size}`
              : "Re-rendre"}
        </Button>
      </header>

      {(retryError || applyInfo) && (
        <div className="relative z-[1] shrink-0 border-b border-border px-3 py-1.5 text-xs">
          {retryError && (
            <p className="text-destructive" role="alert">
              {retryError}
            </p>
          )}
          {applyInfo && !retryError && (
            <p className="text-signal" role="status">
              {applyInfo}
            </p>
          )}
        </div>
      )}

      {latestStitch && (
        <div className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-signal/5 px-3 py-2 text-xs md:px-4">
          <Stack className="size-3.5 text-signal" weight="bold" aria-hidden />
          <span className="font-medium text-foreground">
            {latestStitch.title}
          </span>
          <span className="font-mono text-muted-foreground">
            {latestStitch.clipIds.length} clips
            {typeof latestStitch.durationSeconds === "number"
              ? ` · ~${Math.round(latestStitch.durationSeconds)}s`
              : ""}
          </span>
          {latestStitch.status === "rendering" ||
          latestStitch.status === "pending" ? (
            <span className="text-amber-600 dark:text-amber-300">
              Assemblage en cours…
            </span>
          ) : null}
          {latestStitch.status === "failed" ? (
            <span className="text-destructive">
              Échec
              {latestStitch.errorMessage
                ? ` — ${latestStitch.errorMessage}`
                : ""}
            </span>
          ) : null}
          {latestStitch.status === "ready" && latestStitch.resultUrl ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto h-7 cursor-pointer"
                disabled={downloading}
                onClick={() =>
                  void onShareMedia(
                    latestStitch.resultUrl!,
                    latestStitch.title,
                  )
                }
              >
                <ShareNetwork className="size-3.5" weight="bold" />
                Partager
              </Button>
              <Button
                type="button"
                size="sm"
                className="cta-signal h-7 cursor-pointer border-0 px-3 hover:bg-signal"
                disabled={downloading}
                onClick={() => {
                  const plat =
                    EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)
                      ?.fileSlug ?? exportPlatform;
                  setDownloading(true);
                  void downloadUrl(
                    latestStitch.resultUrl!,
                    safeDownloadName(latestStitch.title, 1, plat),
                  )
                    .then(() => setApplyInfo("Assemblage téléchargé"))
                    .catch((err) =>
                      setRetryError(
                        err instanceof Error
                          ? err.message
                          : "Téléchargement échoué",
                      ),
                    )
                    .finally(() => setDownloading(false));
                }}
              >
                <DownloadSimple className="size-3.5" weight="bold" />
                {downloading ? "…" : "Télécharger le reel"}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {canStitch && (
        <div className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-card/50 px-3 py-2 text-xs backdrop-blur-sm md:px-4">
          <p className="atelier-label text-signal">Assembler</p>
          <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {stitchQueue.map((c, i) => (
              <li
                key={c._id}
                className="inline-flex max-w-[10rem] items-center gap-1 rounded-md bg-secondary/80 px-2 py-1"
              >
                <span className="font-mono text-[10px] text-signal">
                  {i + 1}
                </span>
                <span className="truncate font-medium">{c.title}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(c.endSec - c.startSec)}s
                </span>
              </li>
            ))}
          </ol>
          <span className="font-mono text-muted-foreground">
            Total ~{Math.round(stitchTotalSec)}s
          </span>
          <Button
            type="button"
            size="sm"
            disabled={stitching}
            onClick={() =>
              void onStitchSelected(stitchQueue.map((c) => c._id))
            }
            className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
          >
            <Stack className="size-3.5" weight="bold" />
            {stitching ? "File…" : "Assembler"}
          </Button>
        </div>
      )}

      {/* Corps : clips | stage | outils */}
      <div className="relative z-[1] grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] xl:grid-cols-[300px_minmax(0,1fr)_340px] 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="atelier-panel min-h-0 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
          <ClipFilmstrip
            clips={clips}
            focusedId={focusedClipId}
            selectedIds={selectedIds}
            sort={sortMode}
            onSort={setSortMode}
            onFocus={(id) => {
              setFocusedClipId(id);
              setEditingClipId(null);
              const hit = clips.find((c) => c._id === id);
              // Clip déjà rendu → Final (rapide). Soft seulement pour polish volontaire.
              if (hit?.resultUrl && hit.status === "ready") {
                setPreferSoft(false);
              }
            }}
            onToggleSelect={toggleSelect}
            onSelectAll={() =>
              setSelectedIds(new Set(clips.map((c) => c._id)))
            }
            onClearSelect={() => setSelectedIds(new Set())}
          />
        </aside>

        <main className="relative min-h-0 overflow-hidden bg-[color-mix(in_oklab,var(--background)_35%,#061a12)] p-3">
          {focusedClip && (
            <ClipStagePreview
              clip={focusedClip}
              sourceUrl={project.sourceVideoUrl}
              softPreview={preferSoft}
              captionStyle={captionStyle}
              lookFilter={lookFilter}
              punchEffect={punchEffect}
              layoutMode={layoutMode}
              splitSwap={splitSwap}
              splitFocusTop={splitFocusTop ?? DEFAULT_SPLIT_FOCUS_TOP}
              splitFocusBot={splitFocusBot ?? DEFAULT_SPLIT_FOCUS_BOT}
              smartFocus={smartFocus}
              logoUrl={project.logoUrl}
              logoCorner={logoCorner}
              logoOpacity={logoOpacity}
              compact
              editing={editingClipId === focusedClip._id}
              postMetaBusy={postMetaBusy}
              postPlatformLabel={
                EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)?.label
              }
              onGeneratePostMeta={() => {
                setPostMetaBusy(true);
                void enqueuePostMeta({
                  clipId: focusedClip._id,
                  platform: exportPlatform,
                })
                  .catch((err) => {
                    setRetryError(
                      err instanceof Error
                        ? err.message
                        : "Génération titre post échouée",
                    );
                  })
                  .finally(() => setPostMetaBusy(false));
              }}
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
                    onSave={(args) => onSaveClipTrim(focusedClip._id, args)}
                    onCancel={() => setEditingClipId(null)}
                  />
                ) : null
              }
            />
          )}
        </main>

        <aside className="hidden min-h-0 lg:block">
          <ClipRenderOptions {...renderOptionsProps} variant="drawer" />
        </aside>
      </div>

      {/* Barre bas : In/Out + actions clip + export plateforme */}
      <footer className="relative z-[1] shrink-0 border-t border-border/70 bg-card/50 px-3 py-2 backdrop-blur-md md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {focusedClip && hasSource && editingClipId !== focusedClip._id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={focusedClip.status === "rendering"}
              onClick={() => setEditingClipId(focusedClip._id)}
              className="h-8 cursor-pointer"
            >
              Ajuster In/Out
            </Button>
          )}
          {focusedClip?.resultUrl && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={downloading}
                className="h-8 cursor-pointer"
                onClick={() =>
                  void onShareMedia(
                    focusedClip.resultUrl!,
                    focusedClip.title,
                  )
                }
              >
                <ShareNetwork className="size-3.5" weight="bold" />
                Partager
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={downloading}
                className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
                onClick={() => {
                  const plat =
                    EXPORT_PLATFORMS.find((p) => p.id === exportPlatform)
                      ?.fileSlug ?? exportPlatform;
                  setRetryError(null);
                  setDownloading(true);
                  void downloadUrl(
                    focusedClip.resultUrl!,
                    safeDownloadName(
                      focusedClip.title,
                      focusedClip.order,
                      plat,
                    ),
                  )
                    .then(() => setApplyInfo("Téléchargement lancé"))
                    .catch((err) =>
                      setRetryError(
                        err instanceof Error
                          ? err.message
                          : "Téléchargement échoué",
                      ),
                    )
                    .finally(() => setDownloading(false));
                }}
              >
                <DownloadSimple className="size-3.5" weight="bold" />
                {downloading ? "…" : "Ce clip"}
              </Button>
            </>
          )}
          <div
            className="flex flex-wrap gap-1"
            role="radiogroup"
            aria-label="Plateforme"
          >
            {EXPORT_PLATFORMS.map((p) => {
              const active = p.id === exportPlatform;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={p.hint + " · " + p.captionHint}
                  onClick={() => setExportPlatform(p.id)}
                  className={
                    active
                      ? "cursor-pointer rounded-md bg-signal/20 px-2 py-1 text-[11px] font-medium text-signal ring-1 ring-signal/40"
                      : "cursor-pointer rounded-md bg-secondary/70 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 cursor-pointer"
              onClick={() => setToolsOpen((v) => !v)}
            >
              {toolsOpen ? "Fermer outils" : "Outils"}
            </Button>
          </div>
          {hasSource && (
            <button
              type="button"
              onClick={() => setToolsOpen((v) => !v)}
              className="hidden cursor-pointer text-[11px] text-muted-foreground hover:text-foreground lg:inline"
            >
              {toolsOpen ? "Fermer trim manuel" : "+ Clip manuel"}
            </button>
          )}
        </div>
        {toolsOpen && hasSource && (
          <div className="mt-2 max-h-[min(55vh,28rem)] overflow-y-auto border-t border-border pt-2">
            <div className="lg:hidden">
              <ClipRenderOptions {...renderOptionsProps} defaultOpen />
            </div>
            <div className="mt-2">
              <ClipManualTrim
                sourceUrl={project.sourceVideoUrl!}
                durationSeconds={project.durationSeconds}
                disabled={false}
                creating={creatingManual}
                onCreate={onCreateManual}
              />
            </div>
          </div>
        )}
      </footer>

      {project.sourceVideoUrl && focusedClip && (
        <SplitFrameDialog
          open={splitFrameOpen}
          sourceUrl={project.sourceVideoUrl}
          startSec={focusedClip.startSec}
          endSec={focusedClip.endSec}
          focusTop={splitFocusTop ?? DEFAULT_SPLIT_FOCUS_TOP}
          focusBot={splitFocusBot ?? DEFAULT_SPLIT_FOCUS_BOT}
          onClose={() => setSplitFrameOpen(false)}
          onApply={(top, bot) => {
            setLocalFocusTop(top);
            setLocalFocusBot(bot);
            setPreferSoft(true);
            void persistOption({
              splitFocusTop: top,
              splitFocusBot: bot,
            });
          }}
          onResetAuto={() => {
            setLocalFocusTop(null);
            setLocalFocusBot(null);
            void persistOption({ clearSplitFocus: true });
          }}
        />
      )}

      {project.sourceVideoUrl && focusedClip && (
        <SmartFrameDialog
          open={smartFrameOpen}
          sourceUrl={project.sourceVideoUrl}
          startSec={focusedClip.startSec}
          endSec={focusedClip.endSec}
          focus={smartFocus ?? DEFAULT_SMART_FOCUS}
          onClose={() => setSmartFrameOpen(false)}
          onApply={(focus) => {
            setLocalSmartFocus(focus);
            setPreferSoft(true);
            setSmartFrameOpen(false);
            void persistOption({ smartFocus: focus });
          }}
          onResetAuto={() => {
            setLocalSmartFocus(null);
            setSmartFrameOpen(false);
            void persistOption({ clearSmartFocus: true });
          }}
        />
      )}
    </div>
  );
}

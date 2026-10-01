"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Doc, Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  DownloadSimple,
  Image as ImageIcon,
  Microphone,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GenerationProgress } from "@/components/GenerationProgress";
import { StudioStagePreview } from "@/components/StudioStagePreview";
import {
  FACELESS_LOOKS,
  FACELESS_VOICES,
  matchFacelessLookId,
  matchFacelessVoiceId,
  type FacelessLookId,
  type FacelessVoiceId,
} from "@/lib/facelessPresets";
import { downloadUrl, safeDownloadName } from "@/lib/clipStatus";

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  script_ready: "Script prêt",
  generating: "Génération…",
  ready: "Prêt",
  exported: "Exporté",
};

function sceneAssetStatus(scene: Pick<Doc<"scenes">, "imageUrl" | "audioUrl">) {
  const image = Boolean(scene.imageUrl);
  const audio = Boolean(scene.audioUrl);
  if (image && audio) return { label: "OK", tone: "ok" as const };
  if (image || audio) return { label: "…", tone: "mid" as const };
  return { label: "—", tone: "wait" as const };
}

function sceneJobHint(
  jobs: Doc<"generationJobs">[] | undefined,
  sceneId: Id<"scenes">,
  kind: "image" | "voiceover",
): string | null {
  if (!jobs) return null;
  const job = jobs.find(
    (j) => j.sceneId === sceneId && j.type === kind && j.status !== "done",
  );
  if (!job) return null;
  if (job.status === "processing") return "Génération…";
  if (job.status === "pending") return "En file";
  if (job.status === "failed") return job.errorMessage ?? "Échec";
  return null;
}

/**
 * Atelier faceless Opus-like : scènes | stage 9:16 | outils Style.
 */
export default function ProjectPage() {
  const params = useParams<{ studioId: string; projectId: string }>();
  const studioId = params.studioId as Id<"studios">;
  const projectId = params.projectId as Id<"videoProjects">;

  const data = useQuery(api.videoProjects.getVideoProjectWithScenes, {
    projectId,
  });
  const studio = useQuery(api.studios.getStudio, { studioId });
  const jobs = useQuery(api.generationJobs.getJobsByProject, {
    videoProjectId: projectId,
  });
  const generateScript = useMutation(api.videoProjects.generateScript);
  const queueJobs = useMutation(api.videoProjects.queueGenerationJobs);
  const updateScene = useMutation(api.videoProjects.updateScene);
  const deleteScene = useMutation(api.videoProjects.deleteScene);
  const queueSceneJobs = useMutation(api.videoProjects.queueSceneJobs);
  const applyLookAndRegenImages = useMutation(
    api.videoProjects.applyLookAndRegenImages,
  );
  const applyVoiceAndRegen = useMutation(api.videoProjects.applyVoiceAndRegen);

  const [busy, setBusy] = useState<
    "script" | "assets" | "style" | "voice" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [preferSoft, setPreferSoft] = useState(true);
  const [focusedOrder, setFocusedOrder] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, { narrationText: string; imagePrompt: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const hasActiveScriptJob = Boolean(
    jobs?.some(
      (j) =>
        j.type === "script" &&
        (j.status === "pending" || j.status === "processing"),
    ),
  );
  const hasActiveAssetJobs = Boolean(
    jobs?.some(
      (j) =>
        (j.type === "image" || j.type === "voiceover") &&
        (j.status === "pending" || j.status === "processing"),
    ),
  );
  const hasActiveAssembly = Boolean(
    jobs?.some(
      (j) =>
        j.type === "video_assembly" &&
        (j.status === "pending" || j.status === "processing"),
    ),
  );

  useEffect(() => {
    if (!data?.scenes) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const scene of data.scenes) {
        if (!next[scene._id]) {
          next[scene._id] = {
            narrationText: scene.narrationText,
            imagePrompt: scene.imagePrompt ?? "",
          };
        }
      }
      return next;
    });
  }, [data?.scenes]);

  useEffect(() => {
    if (!data?.scenes?.length) return;
    if (
      focusedOrder == null ||
      !data.scenes.some((s) => s.order === focusedOrder)
    ) {
      setFocusedOrder(data.scenes[0].order);
    }
  }, [data?.scenes, focusedOrder]);

  if (data === undefined || studio === undefined) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col gap-3 p-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      </div>
    );
  }

  if (data === null || studio === null) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">Projet introuvable</p>
        <Link href="/dashboard" className="text-sm text-signal underline">
          Dashboard
        </Link>
      </div>
    );
  }

  const { project, scenes } = data;
  const focused =
    scenes.find((s) => s.order === focusedOrder) ?? scenes[0] ?? null;
  const focusedIndex = focused
    ? scenes.findIndex((s) => s._id === focused._id)
    : 0;

  const autoPipeline = Boolean(project.autoGenerateAssets);
  const pipelineRunning =
    hasActiveScriptJob ||
    hasActiveAssetJobs ||
    hasActiveAssembly ||
    project.status === "generating" ||
    (project.status === "draft" && hasActiveScriptJob);

  const canScript =
    (project.status === "draft" || project.status === "script_ready") &&
    !hasActiveScriptJob;
  const showApproveCta =
    !autoPipeline &&
    scenes.length > 0 &&
    (project.status === "script_ready" ||
      (project.status === "draft" && scenes.length > 0));
  const canQueue =
    showApproveCta &&
    !hasActiveAssetJobs &&
    (project.status === "script_ready" ||
      project.status === "generating" ||
      project.status === "draft");
  const hidePrimaryScript =
    autoPipeline &&
    (hasActiveScriptJob ||
      (project.status === "draft" && scenes.length === 0) ||
      project.status === "generating");

  const activeLook =
    (project.lookId as FacelessLookId | undefined) ??
    matchFacelessLookId(studio.visualStyle);
  const activeVoice =
    (project.voiceId as FacelessVoiceId | undefined) ??
    matchFacelessVoiceId(studio.voiceInstruct ?? studio.narrationTone);

  async function onGenerateScript() {
    setError(null);
    setBusy("script");
    try {
      await generateScript({ projectId });
      setInfo("Script mis en file");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function onQueueAssets() {
    setError(null);
    setBusy("assets");
    try {
      await queueJobs({ projectId });
      setInfo("Images + voix en file");
      setPreferSoft(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveScene(sceneId: Id<"scenes">) {
    const draft = drafts[sceneId];
    if (!draft) return;
    setSavingId(sceneId);
    setError(null);
    try {
      await updateScene({
        sceneId,
        narrationText: draft.narrationText,
        imagePrompt: draft.imagePrompt,
      });
      setInfo("Scène enregistrée");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  async function onRegenScene(
    sceneId: Id<"scenes">,
    kinds: Array<"image" | "voiceover">,
  ) {
    setError(null);
    setPreferSoft(true);
    try {
      await queueSceneJobs({ sceneId, kinds });
      setInfo(
        kinds.length === 2
          ? "Regen image + voix"
          : kinds[0] === "image"
            ? "Regen image"
            : "Regen voix",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function onDeleteScene(sceneId: Id<"scenes">) {
    if (!confirm("Supprimer cette scène ?")) return;
    setError(null);
    try {
      await deleteScene({ sceneId });
      setInfo("Scène supprimée");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function onApplyLook(lookId: FacelessLookId) {
    setError(null);
    setBusy("style");
    setPreferSoft(true);
    try {
      const { jobCount } = await applyLookAndRegenImages({
        projectId,
        lookId,
      });
      const look = FACELESS_LOOKS.find((l) => l.id === lookId);
      setInfo(
        `Style « ${look?.label ?? lookId} » → ${jobCount} image${jobCount > 1 ? "s" : ""} en file`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function onApplyVoice(voiceId: FacelessVoiceId) {
    setError(null);
    setBusy("voice");
    try {
      const { jobCount } = await applyVoiceAndRegen({
        projectId,
        voiceId,
      });
      const voice = FACELESS_VOICES.find((v) => v.id === voiceId);
      setInfo(
        `Voix « ${voice?.label ?? voiceId} » → ${jobCount} scène${jobCount > 1 ? "s" : ""} en file`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  const draft = focused
    ? (drafts[focused._id] ?? {
        narrationText: focused.narrationText,
        imagePrompt: focused.imagePrompt ?? "",
      })
    : null;

  return (
    <div
      data-atelier-workspace
      className="atelier-grain fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background"
    >
      {/* Top bar */}
      <header className="relative z-[1] flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 bg-card/40 px-3 py-2 backdrop-blur-md md:px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" weight="bold" />
          Atelier
        </Link>
        <span className="text-muted-foreground/40" aria-hidden>
          /
        </span>
        <h1 className="min-w-0 truncate font-display text-lg tracking-tight">
          {project.title}
        </h1>
        <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
        {pipelineRunning && (
          <span className="text-[11px] text-amber-600 dark:text-amber-300">
            Pipeline en cours…
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {!hidePrimaryScript && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer"
              disabled={!canScript || busy !== null || hasActiveScriptJob}
              onClick={() => void onGenerateScript()}
            >
              {busy === "script" || hasActiveScriptJob
                ? "Script…"
                : scenes.length
                  ? "Re-script"
                  : "Script"}
            </Button>
          )}
          {(showApproveCta ||
            (autoPipeline &&
              project.status === "script_ready" &&
              scenes.length > 0)) && (
            <Button
              type="button"
              size="sm"
              className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
              disabled={
                busy !== null ||
                scenes.length === 0 ||
                hasActiveAssetJobs ||
                (showApproveCta && !canQueue)
              }
              onClick={() => void onQueueAssets()}
            >
              <Sparkle className="size-3.5" weight="bold" />
              {busy === "assets" || hasActiveAssetJobs
                ? "Assets…"
                : "Images + voix"}
            </Button>
          )}
          {project.finalVideoUrl && (
            <Button
              type="button"
              size="sm"
              className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
              disabled={downloading}
              onClick={() => {
                setDownloading(true);
                void downloadUrl(
                  project.finalVideoUrl!,
                  safeDownloadName(project.title, 1, "reels"),
                )
                  .then(() => setInfo("Téléchargement lancé"))
                  .catch((err) =>
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Téléchargement échoué",
                    ),
                  )
                  .finally(() => setDownloading(false));
              }}
            >
              <DownloadSimple className="size-3.5" weight="bold" />
              {downloading ? "…" : "Export"}
            </Button>
          )}
        </div>
      </header>

      {(error || info) && (
        <div className="relative z-[1] shrink-0 border-b border-border/60 px-3 py-1.5 text-xs md:px-4">
          {error ? (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-signal" role="status">
              {info}
            </p>
          )}
        </div>
      )}

      {pipelineRunning && (
        <div className="relative z-[1] max-h-28 shrink-0 overflow-y-auto border-b border-border/50 px-3 py-2 md:px-4">
          <GenerationProgress jobs={jobs} />
        </div>
      )}

      {/* Corps atelier */}
      <div className="relative z-[1] grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* Filmstrip scènes */}
        <aside className="atelier-panel min-h-0 overflow-y-auto border-b border-border p-2 lg:border-b-0 lg:border-r">
          <p className="atelier-label mb-2 px-1">Scènes</p>
          {scenes.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              {hasActiveScriptJob || autoPipeline
                ? "Script en cours…"
                : "Lance le script"}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {scenes.map((scene, index) => {
                const status = sceneAssetStatus(scene);
                const active = focused?._id === scene._id;
                return (
                  <li key={scene._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setFocusedOrder(scene.order);
                        setPreferSoft(true);
                      }}
                      className={
                        active
                          ? "flex w-full cursor-pointer gap-2 rounded-lg bg-signal/15 p-1.5 ring-1 ring-signal/40"
                          : "flex w-full cursor-pointer gap-2 rounded-lg p-1.5 hover:bg-secondary/60"
                      }
                    >
                      <div className="relative aspect-[9/16] w-12 shrink-0 overflow-hidden rounded-md bg-black">
                        {scene.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={scene.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                            {status.label}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {String(scene.order).padStart(2, "0")} · {index + 1}/
                          {scenes.length}
                        </p>
                        <p className="line-clamp-2 text-[11px] leading-snug text-foreground">
                          {scene.narrationText}
                        </p>
                        <span
                          className={
                            status.tone === "ok"
                              ? "text-[10px] text-emerald-400"
                              : status.tone === "mid"
                                ? "text-[10px] text-amber-400"
                                : "text-[10px] text-muted-foreground"
                          }
                        >
                          {status.label === "OK"
                            ? "Complet"
                            : status.label === "…"
                              ? "Partiel"
                              : "Attente"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Stage */}
        <main className="relative min-h-0 overflow-hidden bg-[color-mix(in_oklab,var(--background)_35%,#061a12)] p-3">
          <StudioStagePreview
            scene={focused}
            sceneIndex={Math.max(0, focusedIndex)}
            sceneCount={scenes.length || 1}
            finalVideoUrl={project.finalVideoUrl}
            softPreview={preferSoft}
            imageHint={
              focused
                ? sceneJobHint(jobs, focused._id, "image")
                : null
            }
            voiceHint={
              focused
                ? sceneJobHint(jobs, focused._id, "voiceover")
                : null
            }
          />
        </main>

        {/* Outils */}
        <aside className="atelier-panel hidden min-h-0 overflow-y-auto border-l border-border p-3 lg:block">
          <p className="font-display text-[13px] tracking-tight text-foreground">
            Style illustration
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Change → regen <strong>toutes</strong> les images
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FACELESS_LOOKS.map((look) => {
              const active = activeLook === look.id;
              return (
                <button
                  key={look.id}
                  type="button"
                  title={look.hint}
                  disabled={busy === "style" || hasActiveAssetJobs}
                  onClick={() => void onApplyLook(look.id)}
                  className={
                    active
                      ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1.5 text-xs font-semibold text-signal ring-1 ring-signal/45"
                      : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  }
                >
                  {look.label}
                </button>
              );
            })}
          </div>

          <p className="mt-5 font-display text-[13px] tracking-tight text-foreground">
            Voix OmniVoice
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Change → regen <strong>toutes</strong> les voix
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FACELESS_VOICES.map((voice) => {
              const active = activeVoice === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  title={voice.hint}
                  disabled={busy === "voice" || hasActiveAssetJobs}
                  onClick={() => void onApplyVoice(voice.id)}
                  className={
                    active
                      ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1.5 text-xs font-semibold text-signal ring-1 ring-signal/45"
                      : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  }
                >
                  {voice.label}
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <p className="atelier-label mb-2">Scène active</p>            {focused && draft ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={editing ? "secondary" : "outline"}
                    className="h-8 cursor-pointer"
                    onClick={() => setEditing((v) => !v)}
                  >
                    {editing ? "Fermer" : "Éditer"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 cursor-pointer"
                    disabled={hasActiveAssetJobs}
                    onClick={() =>
                      void onRegenScene(focused._id, ["image"])
                    }
                  >
                    <ImageIcon className="size-3.5" weight="bold" />
                    Image
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 cursor-pointer"
                    disabled={hasActiveAssetJobs}
                    onClick={() =>
                      void onRegenScene(focused._id, ["voiceover"])
                    }
                  >
                    <Microphone className="size-3.5" weight="bold" />
                    Voix
                  </Button>
                </div>
                {editing ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Narration</Label>
                      <Textarea
                        rows={4}
                        value={draft.narrationText}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [focused._id]: {
                              ...draft,
                              narrationText: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prompt image</Label>
                      <Textarea
                        rows={3}
                        value={draft.imagePrompt}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [focused._id]: {
                              ...draft,
                              imagePrompt: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="cursor-pointer"
                        disabled={savingId === focused._id}
                        onClick={() => void onSaveScene(focused._id)}
                      >
                        {savingId === focused._id ? "…" : "Enregistrer"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        disabled={hasActiveAssetJobs}
                        onClick={() =>
                          void onRegenScene(focused._id, [
                            "image",
                            "voiceover",
                          ])
                        }
                      >
                        Regen tout
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-destructive"
                        onClick={() => void onDeleteScene(focused._id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {focused.narrationText.slice(0, 160)}
                    {focused.narrationText.length > 160 ? "…" : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucune scène</p>
            )}
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <p className="atelier-label mb-2">Bientôt</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Musique bed, logo, captions karaoke — même pack que les clips.
            </p>
          </div>
        </aside>
      </div>

      {/* Barre bas mobile outils */}
      <footer className="relative z-[1] shrink-0 border-t border-border/70 bg-card/50 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FACELESS_LOOKS.map((look) => (
            <button
              key={look.id}
              type="button"
              disabled={busy === "style" || hasActiveAssetJobs}
              onClick={() => void onApplyLook(look.id)}
              className={
                activeLook === look.id
                  ? "shrink-0 cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                  : "shrink-0 cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-50"
              }
            >
              {look.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          {FACELESS_VOICES.map((voice) => (
            <button
              key={voice.id}
              type="button"
              disabled={busy === "voice" || hasActiveAssetJobs}
              onClick={() => void onApplyVoice(voice.id)}
              className={
                activeVoice === voice.id
                  ? "shrink-0 cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                  : "shrink-0 cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-50"
              }
            >
              {voice.label}
            </button>
          ))}
        </div>
        {focused && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 cursor-pointer"
              disabled={hasActiveAssetJobs}
              onClick={() => void onRegenScene(focused._id, ["image"])}
            >
              Regen image
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 cursor-pointer"
              disabled={hasActiveAssetJobs}
              onClick={() => void onRegenScene(focused._id, ["voiceover"])}
            >
              Regen voix
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 cursor-pointer"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Fermer" : "Éditer"}
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}

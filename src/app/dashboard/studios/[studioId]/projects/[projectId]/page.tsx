"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Doc, Id } from "@convex/_generated/dataModel";
import {
  ArrowLeft,
  CaretDown,
  DownloadSimple,
  Image as ImageIcon,
  Microphone,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StudioStagePreview } from "@/components/StudioStagePreview";
import {
  FACELESS_LOOKS,
  FACELESS_VOICES,
  matchFacelessLookId,
  matchFacelessVoiceId,
  resolveLookId,
  type CastMember,
  type FacelessLookId,
  type FacelessVoiceId,
} from "@/lib/facelessPresets";
import { downloadUrl, safeDownloadName, facelessCardStatus } from "@/lib/clipStatus";

const PIPELINE_STEPS = [
  { key: "script", label: "Script" },
  { key: "image", label: "Images" },
  { key: "voiceover", label: "Voix" },
  { key: "video_assembly", label: "Montage" },
] as const;

type StepKey = (typeof PIPELINE_STEPS)[number]["key"];
type StepState = "wait" | "active" | "done" | "failed";

function stepState(
  jobs: Doc<"generationJobs">[] | undefined,
  key: StepKey,
): StepState {
  if (!jobs?.length) return "wait";
  const ofType = jobs.filter((j) => j.type === key);
  if (ofType.length === 0) return "wait";
  if (ofType.some((j) => j.status === "failed")) return "failed";
  if (ofType.some((j) => j.status === "pending" || j.status === "processing"))
    return "active";
  if (ofType.every((j) => j.status === "done")) return "done";
  return "wait";
}

function FacelessStepProgress({
  jobs,
}: {
  jobs: Doc<"generationJobs">[] | undefined;
}) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2">
      {PIPELINE_STEPS.map((step, i) => {
        const state = stepState(jobs, step.key);
        return (
          <li key={step.key} className="flex min-w-0 items-center gap-1 sm:gap-2">
            {i > 0 && (
              <span className="hidden text-muted-foreground/40 sm:inline" aria-hidden>
                →
              </span>
            )}
            <span
              className={
                state === "active"
                  ? "rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300"
                  : state === "done"
                    ? "rounded-md bg-signal/10 px-2 py-1 text-[11px] font-medium text-signal"
                    : state === "failed"
                      ? "rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive"
                      : "rounded-md px-2 py-1 text-[11px] text-muted-foreground"
              }
            >
              {step.label}
              {state === "active" ? "…" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const router = useRouter();
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
  const applyLookAndVoice = useMutation(api.videoProjects.applyLookAndVoice);
  const deleteVideoProject = useMutation(api.videoProjects.deleteVideoProject);

  const [busy, setBusy] = useState<
    "script" | "assets" | "adjust" | "delete" | null
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
  const [castDraft, setCastDraft] = useState<CastMember[] | null>(null);
  const [draftLookId, setDraftLookId] = useState<FacelessLookId | null>(null);
  const [draftVoiceId, setDraftVoiceId] = useState<FacelessVoiceId | null>(
    null,
  );
  const [showAdjust, setShowAdjust] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMore) return;
    function onPointerDown(e: MouseEvent) {
      if (
        moreRef.current &&
        !moreRef.current.contains(e.target as Node)
      ) {
        setShowMore(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showMore]);

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
        <Link
          href="/dashboard?tab=faceless"
          className="text-sm text-signal underline"
        >
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

  const writingPhase =
    hasActiveScriptJob ||
    (project.status === "draft" && scenes.length === 0);
  const generatingPhase =
    !writingPhase &&
    (hasActiveAssetJobs ||
      hasActiveAssembly ||
      project.status === "generating");
  const canExport = Boolean(project.finalVideoUrl);
  const canRelaunch =
    !writingPhase &&
    !generatingPhase &&
    scenes.length > 0 &&
    !canExport &&
    (project.status === "ready" ||
      project.status === "script_ready" ||
      project.status === "exported" ||
      project.status === "generating");

  const adjustOpen = showAdjust;

  const activeLook = resolveLookId(
    (project.lookId as string | undefined) ??
      matchFacelessLookId(studio.visualStyle),
  );
  const activeVoice =
    (project.voiceId as FacelessVoiceId | undefined) ??
    matchFacelessVoiceId(studio.voiceInstruct ?? studio.narrationTone);

  const cast = castDraft ?? (project.cast as CastMember[] | undefined) ?? [];

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

  async function onConfirmAdjust() {
    const selectedLook = draftLookId ?? activeLook;
    const selectedVoice = draftVoiceId ?? activeVoice;
    const lookChanged = draftLookId != null && draftLookId !== activeLook;
    const voiceChanged =
      draftVoiceId != null && draftVoiceId !== activeVoice;
    const castChanged = castDraft !== null;

    if (!lookChanged && !voiceChanged && !castChanged) {
      setInfo("Rien à appliquer");
      return;
    }

    setError(null);
    setBusy("adjust");
    setPreferSoft(true);
    try {
      const res = await applyLookAndVoice({
        projectId,
        lookId: lookChanged ? selectedLook : undefined,
        voiceId: voiceChanged ? selectedVoice! : undefined,
        cast: castChanged
          ? cast.filter((c) => c.name.trim() || c.appearance.trim())
          : undefined,
      });
      const parts: string[] = [];
      if (lookChanged) parts.push("style");
      if (voiceChanged) parts.push("voix");
      if (castChanged) parts.push("cast");
      setCastDraft(null);
      setDraftLookId(null);
      setDraftVoiceId(null);
      setInfo(
        `${parts.join(" + ")} confirmé → ${res.jobCount} job${res.jobCount > 1 ? "s" : ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  function updateCastField(
    index: number,
    field: keyof CastMember,
    value: string,
  ) {
    const next = [...cast];
    const cur = next[index] ?? {
      id: `char_${index + 1}`,
      name: "",
      appearance: "",
      clothing: "",
    };
    next[index] = { ...cur, [field]: value };
    setCastDraft(next);
  }

  async function onDeleteProject() {
    if (
      !confirm(
        "Supprimer ce reel faceless et toutes ses scènes ? Irréversible.",
      )
    ) {
      return;
    }
    setError(null);
    setBusy("delete");
    try {
      await deleteVideoProject({ projectId });
      router.push("/dashboard?tab=faceless");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setBusy(null);
    }
  }

  async function onExport() {
    if (!project.finalVideoUrl) return;
    setDownloading(true);
    try {
      await downloadUrl(
        project.finalVideoUrl,
        safeDownloadName(project.title, 1, "reels"),
      );
      setInfo("Téléchargement lancé");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Téléchargement échoué",
      );
    } finally {
      setDownloading(false);
    }
  }

  const draft = focused
    ? (drafts[focused._id] ?? {
        narrationText: focused.narrationText,
        imagePrompt: focused.imagePrompt ?? "",
      })
    : null;

  const lookLabel =
    FACELESS_LOOKS.find((l) => l.id === activeLook)?.label ?? "Style";
  const voiceLabel =
    FACELESS_VOICES.find((v) => v.id === activeVoice)?.label ?? "Voix";

  const selectedLook = draftLookId ?? activeLook;
  const selectedVoice = draftVoiceId ?? activeVoice;
  const adjustDirty =
    (draftLookId != null && draftLookId !== activeLook) ||
    (draftVoiceId != null && draftVoiceId !== activeVoice) ||
    castDraft !== null;

  const adjustPanel = (
    <div className="space-y-5">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Choisis style et voix, puis confirme — une seule regen.
      </p>

      <div>
        <p className="font-display text-[13px] tracking-tight text-foreground">
          Style
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FACELESS_LOOKS.map((look) => {
            const selected = selectedLook === look.id;
            return (
              <button
                key={look.id}
                type="button"
                title={look.hint}
                disabled={busy === "adjust"}
                onClick={() => setDraftLookId(look.id)}
                className={
                  selected
                    ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1.5 text-xs font-semibold text-signal ring-1 ring-signal/40 transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]"
                    : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1.5 text-xs text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:text-foreground active:scale-[0.97] disabled:opacity-50"
                }
              >
                {look.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="font-display text-[13px] tracking-tight text-foreground">
          Voix
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FACELESS_VOICES.map((voice) => {
            const selected = selectedVoice === voice.id;
            return (
              <button
                key={voice.id}
                type="button"
                title={voice.hint}
                disabled={busy === "adjust"}
                onClick={() => setDraftVoiceId(voice.id)}
                className={
                  selected
                    ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1.5 text-xs font-semibold text-signal ring-1 ring-signal/40 transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]"
                    : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1.5 text-xs text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:text-foreground active:scale-[0.97] disabled:opacity-50"
                }
              >
                {voice.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="font-display text-[13px] tracking-tight text-foreground">
          Cast
        </p>
        {cast.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Apparaît après le script.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {cast.map((member, i) => (
              <div
                key={member.id || i}
                className="rounded-lg border border-border/70 bg-card/30 p-2"
              >
                <input
                  value={member.name}
                  onChange={(e) =>
                    updateCastField(i, "name", e.target.value)
                  }
                  placeholder="Nom"
                  className="mb-1 w-full bg-transparent text-xs font-semibold text-foreground outline-none"
                />
                <textarea
                  value={member.appearance}
                  onChange={(e) =>
                    updateCastField(i, "appearance", e.target.value)
                  }
                  placeholder="Appearance (EN)"
                  rows={2}
                  className="mb-1 w-full resize-none bg-transparent text-[10px] leading-snug text-muted-foreground outline-none"
                />
                <input
                  value={member.clothing}
                  onChange={(e) =>
                    updateCastField(i, "clothing", e.target.value)
                  }
                  placeholder="Clothing (EN)"
                  className="w-full bg-transparent text-[10px] text-muted-foreground outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        className="h-9 w-full cursor-pointer font-semibold transition-transform duration-150 ease-out active:scale-[0.97]"
        disabled={busy === "adjust" || hasActiveAssetJobs || !adjustDirty}
        onClick={() => void onConfirmAdjust()}
      >
        {busy === "adjust"
          ? "Application…"
          : adjustDirty
            ? "Confirmer les changements"
            : "Aucun changement"}
      </Button>

      {focused && draft && (
        <div>
          <p className="font-display text-[13px] tracking-tight text-foreground">
            Scène
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
              onClick={() => void onRegenScene(focused._id, ["image"])}
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
          {editing && (
            <div className="mt-2 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Narration</Label>
                <Textarea
                  rows={3}
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
              <Button
                type="button"
                size="sm"
                className="h-8 cursor-pointer"
                disabled={savingId === focused._id}
                onClick={() => void onSaveScene(focused._id)}
              >
                {savingId === focused._id ? "…" : "Sauver"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      data-atelier-workspace
      className="atelier-grain fixed inset-x-0 bottom-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background"
    >
      {/* Top bar */}
      <header className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 overflow-visible border-b border-border/70 bg-card/95 px-3 py-2 backdrop-blur-md md:px-4">
        <Link
          href="/dashboard?tab=faceless"
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
          {facelessCardStatus(project).label}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {writingPhase && (
            <span className="rounded-md bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Écriture…
            </span>
          )}
          {generatingPhase && (
            <span className="rounded-md bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              Génération…
            </span>
          )}
          {canExport && (
            <Button
              type="button"
              size="sm"
              className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
              disabled={downloading}
              onClick={() => void onExport()}
            >
              <DownloadSimple className="size-3.5" weight="bold" />
              {downloading ? "…" : "Exporter"}
            </Button>
          )}
          {canRelaunch && (
            <Button
              type="button"
              size="sm"
              className="cta-signal h-8 cursor-pointer border-0 hover:bg-signal"
              disabled={busy !== null || hasActiveAssetJobs}
              onClick={() => void onQueueAssets()}
            >
              <Sparkle className="size-3.5" weight="bold" />
              {busy === "assets" ? "…" : "Relancer images + voix"}
            </Button>
          )}
          <div className="relative" ref={moreRef}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 cursor-pointer"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
              aria-haspopup="menu"
            >
              Plus
              <CaretDown
                className={
                  showMore
                    ? "size-3.5 rotate-180 transition-transform"
                    : "size-3.5 transition-transform"
                }
                weight="bold"
              />
            </Button>
            {showMore && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-lg border border-border bg-card p-1 shadow-xl"
              >
                {!hidePrimaryScript && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs hover:bg-secondary disabled:opacity-50"
                    disabled={!canScript || busy !== null || hasActiveScriptJob}
                    onClick={() => {
                      setShowMore(false);
                      void onGenerateScript();
                    }}
                  >
                    {scenes.length ? "Re-script" : "Script"}
                  </button>
                )}
                {(showApproveCta || scenes.length > 0) && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs hover:bg-secondary disabled:opacity-50"
                    disabled={
                      busy !== null ||
                      scenes.length === 0 ||
                      hasActiveAssetJobs
                    }
                    onClick={() => {
                      setShowMore(false);
                      void onQueueAssets();
                    }}
                  >
                    Images + voix
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  disabled={busy !== null}
                  onClick={() => {
                    setShowMore(false);
                    void onDeleteProject();
                  }}
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {(error || info) && (
        <div className="relative z-10 shrink-0 border-b border-border/60 px-3 py-1.5 text-xs md:px-4">
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
        <div className="relative z-10 shrink-0 border-b border-border/50 px-3 py-2 md:px-4">
          <FacelessStepProgress jobs={jobs} />
        </div>
      )}

      {/* Corps atelier */}
      <div className="relative z-0 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Filmstrip scènes */}
        <aside className="atelier-panel min-h-0 overflow-y-auto border-b border-border p-2 lg:border-b-0 lg:border-r">
          <p className="atelier-label mb-2 px-1">Scènes</p>
          {scenes.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              {hasActiveScriptJob || autoPipeline
                ? "Écriture en cours…"
                : "En attente du script"}
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPreferSoft(true)}
              className={
                preferSoft
                  ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                  : "cursor-pointer rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              Soft
            </button>
            <button
              type="button"
              onClick={() => setPreferSoft(false)}
              disabled={!project.finalVideoUrl}
              className={
                !preferSoft
                  ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                  : "cursor-pointer rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              }
            >
              Final
            </button>
          </div>

          <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <p>
              Style ·{" "}
              <span className="font-medium text-foreground">{lookLabel}</span>
            </p>
            <p>
              Voix ·{" "}
              <span className="font-medium text-foreground">{voiceLabel}</span>
            </p>
          </div>

          <button
            type="button"
            aria-expanded={adjustOpen}
            className="mt-5 flex w-full cursor-pointer items-center justify-between rounded-lg border border-border/80 bg-card/50 px-3 py-2.5 text-left text-xs font-medium text-foreground hover:border-signal/40"
            onClick={() => setShowAdjust((v) => !v)}
          >
            Ajuster style, voix, cast
            <CaretDown
              className={
                adjustOpen
                  ? "size-3.5 rotate-180 transition-transform"
                  : "size-3.5 transition-transform"
              }
              weight="bold"
            />
          </button>

          {adjustOpen && (
            <div className="mt-3 border-t border-border pt-3">
              {adjustPanel}
            </div>
          )}
        </aside>
      </div>

      {/* Sheet mobile Ajuster */}
      {showAdjust && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col bg-background/95 backdrop-blur-md lg:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm tracking-tight">Ajuster</p>
            <button
              type="button"
              className="cursor-pointer rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAdjust(false)}
            >
              Fermer
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{adjustPanel}</div>
        </div>
      )}

      {/* Barre bas mobile */}
      <footer className="relative z-20 shrink-0 border-t border-border/70 bg-card/95 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreferSoft(true)}
            className={
              preferSoft
                ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-xs text-muted-foreground"
            }
          >
            Soft
          </button>
          <button
            type="button"
            onClick={() => setPreferSoft(false)}
            disabled={!project.finalVideoUrl}
            className={
              !preferSoft
                ? "cursor-pointer rounded-lg bg-signal/20 px-2.5 py-1 text-xs font-semibold text-signal"
                : "cursor-pointer rounded-lg bg-secondary/80 px-2.5 py-1 text-xs text-muted-foreground disabled:opacity-40"
            }
          >
            Final
          </button>
          <button
            type="button"
            onClick={() => setShowAdjust(true)}
            className="cursor-pointer rounded-lg border border-border/80 bg-card/50 px-2.5 py-1 text-xs font-medium text-foreground"
          >
            Ajuster
          </button>
          {canExport && (
            <Button
              type="button"
              size="sm"
              className="cta-signal ml-auto h-8 cursor-pointer border-0 hover:bg-signal"
              disabled={downloading}
              onClick={() => void onExport()}
            >
              Exporter
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

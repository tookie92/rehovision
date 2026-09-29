"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GenerationProgress } from "@/components/GenerationProgress";

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
  if (image && audio) return { label: "Complet", tone: "ok" as const };
  if (image || audio) return { label: "Partiel", tone: "mid" as const };
  return { label: "En attente", tone: "wait" as const };
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

export default function ProjectPage() {
  const params = useParams<{ studioId: string; projectId: string }>();
  const studioId = params.studioId as Id<"studios">;
  const projectId = params.projectId as Id<"videoProjects">;

  const data = useQuery(api.videoProjects.getVideoProjectWithScenes, {
    projectId,
  });
  const jobs = useQuery(api.generationJobs.getJobsByProject, {
    videoProjectId: projectId,
  });
  const generateScript = useMutation(api.videoProjects.generateScript);
  const queueJobs = useMutation(api.videoProjects.queueGenerationJobs);
  const updateScene = useMutation(api.videoProjects.updateScene);
  const deleteScene = useMutation(api.videoProjects.deleteScene);
  const queueSceneJobs = useMutation(api.videoProjects.queueSceneJobs);

  const [busy, setBusy] = useState<"script" | "assets" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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

  async function onGenerateScript() {
    setError(null);
    setBusy("script");
    setEditing(false);
    try {
      await generateScript({ projectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur script");
    } finally {
      setBusy(null);
    }
  }

  async function onQueueAssets() {
    setError(null);
    setBusy("assets");
    setEditing(false);
    try {
      await queueJobs({ projectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur génération");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sauvegarde");
      throw err;
    } finally {
      setSavingId(null);
    }
  }

  async function onDeleteScene(sceneId: Id<"scenes">) {
    setError(null);
    try {
      await deleteScene({ sceneId });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[sceneId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression");
    }
  }

  async function onRegenScene(
    sceneId: Id<"scenes">,
    kinds: Array<"image" | "voiceover">,
  ) {
    setError(null);
    try {
      await onSaveScene(sceneId);
      await queueSceneJobs({ sceneId, kinds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur régénération");
    }
  }

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (data === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Projet introuvable.{" "}
        <Link href={`/dashboard/studios/${studioId}`} className="underline">
          Retour
        </Link>
      </p>
    );
  }

  const { project, scenes } = data;
  const autoPipeline = Boolean(project.autoGenerateAssets);
  const pipelineRunning =
    hasActiveScriptJob ||
    hasActiveAssetJobs ||
    project.status === "generating" ||
    (project.status === "draft" && hasActiveScriptJob);

  const canScript =
    (project.status === "draft" || project.status === "script_ready") &&
    !hasActiveScriptJob;
  // Approuver : seulement si pas d'auto-pipeline, ou retry manuel
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

  // Hide "Générer le script" while auto pipeline is already running from createAndStartReel
  const hidePrimaryScript =
    autoPipeline &&
    (hasActiveScriptJob ||
      (project.status === "draft" && scenes.length === 0) ||
      project.status === "generating");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
                {project.title}
              </h1>
              <Badge variant="secondary">
                {STATUS_LABEL[project.status] ?? project.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Sujet : {project.topic}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!hidePrimaryScript && (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                disabled={!canScript || busy !== null || hasActiveScriptJob}
                onClick={onGenerateScript}
              >
                {busy === "script" || hasActiveScriptJob
                  ? "Script en file…"
                  : scenes.length
                    ? "Regénérer le script"
                    : "Générer le script"}
              </Button>
            )}
            {scenes.length > 0 && (
              <Button
                type="button"
                variant={editing ? "secondary" : "outline"}
                className="cursor-pointer"
                disabled={hasActiveScriptJob}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Fermer l’édition" : "Réviser le script"}
              </Button>
            )}
            {showApproveCta && (
              <Button
                type="button"
                className="cursor-pointer"
                disabled={
                  !canQueue ||
                  busy !== null ||
                  scenes.length === 0 ||
                  hasActiveAssetJobs
                }
                onClick={onQueueAssets}
              >
                {busy === "assets" || hasActiveAssetJobs
                  ? "Assets en file…"
                  : "Générer images + voix"}
              </Button>
            )}
            {autoPipeline &&
              project.status === "script_ready" &&
              !hasActiveAssetJobs &&
              scenes.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy !== null}
                  onClick={onQueueAssets}
                >
                  Relancer images + voix
                </Button>
              )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {pipelineRunning && (
          <p className="mt-3 text-sm text-muted-foreground">
            Génération en cours — script, images, voix puis montage.
          </p>
        )}
      </div>

      {(pipelineRunning ||
        project.status === "generating" ||
        project.status === "draft" ||
        jobs) && <GenerationProgress jobs={jobs} />}

      {project.finalVideoUrl && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <video
              key={project.finalVideoUrl}
              src={project.finalVideoUrl}
              controls
              playsInline
              className="mx-auto max-h-[70vh] w-full max-w-sm object-contain"
            />
          </div>
          <a
            href={project.finalVideoUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-background/40 px-4 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
          >
            Télécharger le reel
          </a>
        </div>
      )}

      {scenes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasActiveScriptJob || autoPipeline
            ? "Script en cours — les scènes apparaîtront ici."
            : "Pas encore de scènes. Lance la génération de script."}
        </p>
      ) : (
        <ol className="space-y-6">
          {scenes.map((scene, index) => {
            const status = sceneAssetStatus(scene);
            const imageHint = sceneJobHint(jobs, scene._id, "image");
            const voiceHint = sceneJobHint(jobs, scene._id, "voiceover");
            const draft = drafts[scene._id] ?? {
              narrationText: scene.narrationText,
              imagePrompt: scene.imagePrompt ?? "",
            };
            return (
              <li
                key={scene._id}
                className="grid gap-4 border-t border-border pt-6 md:grid-cols-[140px_1fr]"
              >
                <div className="space-y-2">
                  <p className="font-mono text-xs tracking-widest text-muted-foreground">
                    SCÈNE {String(scene.order).padStart(2, "0")}
                    <span className="ml-1 text-muted-foreground/60">
                      ({index + 1}/{scenes.length})
                    </span>
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      status.tone === "ok"
                        ? "border-emerald-500/40 text-emerald-400"
                        : status.tone === "mid"
                          ? "border-amber-500/40 text-amber-400"
                          : ""
                    }
                  >
                    {status.label}
                  </Badge>
                  {scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.imageUrl}
                      alt=""
                      className="mt-2 aspect-[9/16] w-full max-w-[140px] rounded-md object-cover"
                    />
                  ) : (
                    <div className="relative mt-2 flex aspect-[9/16] w-full max-w-[140px] items-center justify-center rounded-md bg-muted/40">
                      {imageHint && (
                        <span className="px-2 text-center text-[10px] leading-tight text-muted-foreground">
                          {imageHint}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {editing ? (
                    <>
                      <div className="space-y-2">
                        <Label>Narration</Label>
                        <Textarea
                          rows={4}
                          value={draft.narrationText}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [scene._id]: {
                                ...draft,
                                narrationText: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prompt image</Label>
                        <Textarea
                          rows={2}
                          value={draft.imagePrompt}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [scene._id]: {
                                ...draft,
                                imagePrompt: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingId === scene._id}
                          onClick={() => onSaveScene(scene._id)}
                        >
                          {savingId === scene._id
                            ? "Enregistrement…"
                            : "Enregistrer"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={hasActiveAssetJobs}
                          onClick={() =>
                            onRegenScene(scene._id, ["image", "voiceover"])
                          }
                        >
                          Regen image + voix
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={hasActiveAssetJobs}
                          onClick={() => onRegenScene(scene._id, ["image"])}
                        >
                          Regen image
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={hasActiveAssetJobs}
                          onClick={() =>
                            onRegenScene(scene._id, ["voiceover"])
                          }
                        >
                          Regen voix
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => onDeleteScene(scene._id)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-foreground">
                        {scene.narrationText}
                      </p>
                      {scene.imagePrompt && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Prompt : {scene.imagePrompt}
                        </p>
                      )}
                      {scene.audioUrl ? (
                        <audio
                          controls
                          src={scene.audioUrl}
                          className="w-full max-w-md"
                        />
                      ) : (
                        voiceHint && (
                          <p className="text-xs text-muted-foreground">
                            Voix : {voiceHint}
                          </p>
                        )
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

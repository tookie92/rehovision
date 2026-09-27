"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

  const [busy, setBusy] = useState<"script" | "assets" | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function onGenerateScript() {
    setError(null);
    setBusy("script");
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
    try {
      await queueJobs({ projectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur génération");
    } finally {
      setBusy(null);
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
  const canScript =
    project.status === "draft" || project.status === "script_ready";
  const canQueue =
    project.status === "script_ready" ||
    project.status === "generating" ||
    (project.status === "draft" && scenes.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/dashboard/studios/${studioId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Retour aux projets
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">
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
            <Button
              type="button"
              variant="outline"
              disabled={!canScript || busy !== null || hasActiveScriptJob}
              onClick={onGenerateScript}
            >
              {busy === "script" || hasActiveScriptJob
                ? "Script en file…"
                : scenes.length
                  ? "Regénérer le script"
                  : "Générer le script"}
            </Button>
            <Button
              type="button"
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
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      <GenerationProgress jobs={jobs} />

      {project.finalVideoUrl && (
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <video
            key={project.finalVideoUrl}
            src={project.finalVideoUrl}
            controls
            playsInline
            className="mx-auto max-h-[70vh] w-full max-w-sm object-contain"
          />
        </div>
      )}

      {scenes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {hasActiveScriptJob
            ? "Script en cours côté worker Ollama — les scènes apparaîtront ici."
            : "Pas encore de scènes. Lance la génération de script (worker Ollama requis)."}
        </p>
      ) : (
        <ol className="space-y-6">
          {scenes.map((scene) => {
            const status = sceneAssetStatus(scene);
            const imageHint = sceneJobHint(jobs, scene._id, "image");
            const voiceHint = sceneJobHint(jobs, scene._id, "voiceover");
            return (
              <li
                key={scene._id}
                className="grid gap-4 border-t border-border pt-6 md:grid-cols-[140px_1fr]"
              >
                <div className="space-y-2">
                  <p className="font-mono text-xs tracking-widest text-muted-foreground">
                    SCÈNE {String(scene.order).padStart(2, "0")}
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
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

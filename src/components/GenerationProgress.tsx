"use client";

import { Doc } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";

type Job = Doc<"generationJobs">;

const TYPE_LABEL: Record<Job["type"], string> = {
  script: "Script",
  image: "Images",
  voiceover: "Voix",
  video_assembly: "Montage",
};

const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "En file",
  processing: "En cours",
  done: "Terminé",
  failed: "Échec",
};

function latestByType(jobs: Job[], type: Job["type"]): Job | undefined {
  return jobs.find((j) => j.type === type);
}

function countByType(
  jobs: Job[],
  type: "image" | "voiceover",
): { pending: number; processing: number; done: number; failed: number; total: number } {
  const ofType = jobs.filter((j) => j.type === type);
  return {
    pending: ofType.filter((j) => j.status === "pending").length,
    processing: ofType.filter((j) => j.status === "processing").length,
    done: ofType.filter((j) => j.status === "done").length,
    failed: ofType.filter((j) => j.status === "failed").length,
    total: ofType.length,
  };
}

function statusTone(status: Job["status"]) {
  switch (status) {
    case "processing":
      return "border-amber-500/40 text-amber-400";
    case "done":
      return "border-emerald-500/40 text-emerald-400";
    case "failed":
      return "border-destructive/50 text-destructive";
    default:
      return "border-border text-muted-foreground";
  }
}

function Row({
  label,
  status,
  detail,
  error,
}: {
  label: string;
  status: Job["status"];
  detail?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        )}
        {error && (
          <p className="mt-0.5 text-xs text-destructive">{error}</p>
        )}
      </div>
      <Badge variant="outline" className={statusTone(status)}>
        {status === "processing" && (
          <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-400" />
        )}
        {STATUS_LABEL[status]}
      </Badge>
    </div>
  );
}

export function GenerationProgress({ jobs }: { jobs: Job[] | undefined }) {
  if (jobs === undefined) {
    return (
      <div className="rounded-xl border border-border bg-card/30 px-4 py-3 text-sm text-muted-foreground">
        Chargement des jobs…
      </div>
    );
  }

  if (jobs.length === 0) {
    return null;
  }

  const script = latestByType(jobs, "script");
  const images = countByType(jobs, "image");
  const voices = countByType(jobs, "voiceover");
  const video = latestByType(jobs, "video_assembly");

  const active =
    jobs.some((j) => j.status === "pending" || j.status === "processing") ||
    jobs.some((j) => j.status === "failed");

  if (!active && !script && images.total === 0 && voices.total === 0 && !video) {
    return null;
  }

  function aggregateStatus(c: ReturnType<typeof countByType>): Job["status"] {
    if (c.total === 0) return "pending";
    if (c.failed > 0 && c.pending + c.processing === 0) return "failed";
    if (c.processing > 0) return "processing";
    if (c.pending > 0) return "pending";
    return "done";
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 px-4 py-1">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Pipeline
        </p>
        {jobs.some((j) => j.status === "pending" || j.status === "processing") && (
          <p className="text-xs text-muted-foreground">
            Worker GPU en écoute…
          </p>
        )}
      </div>

      {script && (
        <Row
          label={TYPE_LABEL.script}
          status={script.status}
          detail={
            script.status === "processing"
              ? "Ollama génère le script…"
              : script.status === "pending"
                ? "En attente du worker"
                : undefined
          }
          error={script.status === "failed" ? script.errorMessage : undefined}
        />
      )}

      {images.total > 0 && (
        <Row
          label={TYPE_LABEL.image}
          status={aggregateStatus(images)}
          detail={`${images.done}/${images.total} scènes`}
          error={
            images.failed > 0
              ? `${images.failed} échec${images.failed > 1 ? "s" : ""}`
              : undefined
          }
        />
      )}

      {voices.total > 0 && (
        <Row
          label={TYPE_LABEL.voiceover}
          status={aggregateStatus(voices)}
          detail={`${voices.done}/${voices.total} scènes`}
          error={
            voices.failed > 0
              ? `${voices.failed} échec${voices.failed > 1 ? "s" : ""}`
              : undefined
          }
        />
      )}

      {video && (
        <Row
          label={TYPE_LABEL.video_assembly}
          status={video.status}
          detail={
            video.status === "processing"
              ? "ffmpeg assemble le MP4…"
              : undefined
          }
          error={video.status === "failed" ? video.errorMessage : undefined}
        />
      )}
    </div>
  );
}

/** Labels + helpers pour le funnel clips (Opus-style). */

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  uploading: "Upload",
  downloading: "YouTube",
  transcribing: "Transcription",
  proposing: "Hooks",
  rendering: "Rendu",
  ready: "Prêt",
  failed: "Échec",
};

export const CLIP_STATUS_LABEL: Record<string, string> = {
  proposed: "En file",
  rendering: "Rendu…",
  ready: "Prêt",
  failed: "Échec",
};

/** Étapes ordonnées du pipeline (hors terminal ready/failed). */
export const PIPELINE_STEPS = [
  { key: "downloading", label: "Source" },
  { key: "transcribing", label: "Whisper" },
  { key: "proposing", label: "Hooks" },
  { key: "rendering", label: "Rendu" },
] as const;

export type PipelineStepKey = (typeof PIPELINE_STEPS)[number]["key"];

const STEP_ORDER: Record<string, number> = {
  uploading: 0,
  downloading: 0,
  transcribing: 1,
  proposing: 2,
  rendering: 3,
  ready: 4,
  failed: -1,
};

export function pipelineStepIndex(status: string): number {
  return STEP_ORDER[status] ?? 0;
}

export function isPipelineActive(status: string): boolean {
  return (
    status === "uploading" ||
    status === "downloading" ||
    status === "transcribing" ||
    status === "proposing" ||
    status === "rendering"
  );
}

export function formatClipDuration(startSec: number, endSec: number): string {
  const sec = Math.max(0, endSec - startSec);
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function formatTimecode(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function projectStatusTone(status: string): string {
  if (status === "failed") return "text-destructive";
  if (status === "ready") return "text-signal";
  if (isPipelineActive(status)) return "text-amber-400";
  return "text-muted-foreground";
}

export function pipelineDetail(
  status: string,
  opts?: { readyCount?: number; clipCount?: number },
): string {
  const ready = opts?.readyCount ?? 0;
  const total = opts?.clipCount ?? 0;
  switch (status) {
    case "uploading":
      return "Envoi du fichier…";
    case "downloading":
      return "Téléchargement YouTube (yt-dlp)…";
    case "transcribing":
      return "Whisper transcrit l’audio…";
    case "proposing":
      return "Ollama cherche les hooks viraux…";
    case "rendering":
      return total > 0
        ? `Reframe 9:16 + captions — ${ready}/${total} clips`
        : "Reframe 9:16 + captions ffmpeg…";
    case "ready":
      return total > 0
        ? `${ready}/${total} clip${total > 1 ? "s" : ""} prêts à poster`
        : "Terminé";
    case "failed":
      return "Le pipeline s’est arrêté — tu peux relancer";
    default:
      return "";
  }
}

export function safeDownloadName(title: string, order: number): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${String(Math.max(1, order)).padStart(2, "0")}-${slug || "clip"}.mp4`;
}

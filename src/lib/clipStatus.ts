/** Labels + helpers pour le funnel clips (Opus-style). */

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  uploading: "Envoi",
  downloading: "Téléchargement",
  transcribing: "Analyse",
  proposing: "Moments",
  rendering: "Export",
  ready: "Prêt",
  failed: "Échec",
};

export const CLIP_STATUS_LABEL: Record<string, string> = {
  proposed: "En file",
  rendering: "Export…",
  ready: "Prêt",
  failed: "Échec",
};

/** Étapes ordonnées du pipeline (hors terminal ready/failed). */
export const PIPELINE_STEPS = [
  { key: "downloading", label: "Source" },
  { key: "transcribing", label: "Analyse" },
  { key: "proposing", label: "Moments" },
  { key: "rendering", label: "Export" },
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
      return "Récupération de la vidéo…";
    case "transcribing":
      return "Analyse de l’audio et du texte…";
    case "proposing":
      return "Recherche des meilleurs moments…";
    case "rendering":
      return total > 0
        ? `Création des clips 9:16 — ${ready}/${total}`
        : "Création des clips verticaux…";
    case "ready":
      return total > 0
        ? `${ready}/${total} clip${total > 1 ? "s" : ""} prêts à poster`
        : "Terminé";
    case "failed":
      return "Une étape a échoué — tu peux relancer";
    default:
      return "";
  }
}

export function safeDownloadName(
  title: string,
  order: number,
  platform?: string,
): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const plat = (platform || "reel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  const prefix = String(Math.max(1, order)).padStart(2, "0");
  return `${prefix}-${plat}-${slug || "clip"}.mp4`;
}

/** Déclenche N téléchargements séquentiels (navigateur). */
export function downloadUrls(
  items: ReadonlyArray<{ url: string; filename: string }>,
  delayMs = 400,
): void {
  items.forEach((item, i) => {
    window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = item.filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * delayMs);
  });
}

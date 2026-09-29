/**
 * Presets export short-form (friction Viblo) — labels + noms de fichier.
 * La durée cible reste ~30s côté propose_clips ; ici on oriente le download.
 */

export const EXPORT_PLATFORMS = [
  {
    id: "tiktok",
    label: "TikTok",
    fileSlug: "tiktok",
    hint: "9:16 · ~30s · vertical",
  },
  {
    id: "reels",
    label: "Reels",
    fileSlug: "reels",
    hint: "9:16 · ~30s · Instagram",
  },
  {
    id: "shorts",
    label: "Shorts",
    fileSlug: "shorts",
    hint: "9:16 · ~30s · YouTube",
  },
] as const;

export type ExportPlatformId = (typeof EXPORT_PLATFORMS)[number]["id"];

export function isExportPlatform(v: string): v is ExportPlatformId {
  return EXPORT_PLATFORMS.some((p) => p.id === v);
}

export function exportPlatformLabel(id: ExportPlatformId): string {
  return EXPORT_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

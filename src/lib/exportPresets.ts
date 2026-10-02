/**
 * Presets export short-form (friction Viblo) — labels + noms de fichier + style post.
 * La durée cible reste ~30s côté propose_clips ; ici on oriente download + captions.
 */

export const EXPORT_PLATFORMS = [
  {
    id: "tiktok",
    label: "TikTok",
    fileSlug: "tiktok",
    hint: "9:16 · ~30s · vertical",
    captionHint: "Hook court + curiosité · hashtags niche + 1–2 découvrabilité",
  },
  {
    id: "reels",
    label: "Reels",
    fileSlug: "reels",
    hint: "9:16 · ~30s · Instagram",
    captionHint: "Ton IG clean · storytelling · moins de #spam",
  },
  {
    id: "shorts",
    label: "Shorts",
    fileSlug: "shorts",
    hint: "9:16 · ~30s · YouTube",
    captionHint: "Titre clair SEO-friendly · #shorts + sujet",
  },
] as const;

export type ExportPlatformId = (typeof EXPORT_PLATFORMS)[number]["id"];

export function isExportPlatform(v: string): v is ExportPlatformId {
  return EXPORT_PLATFORMS.some((p) => p.id === v);
}

export function exportPlatformLabel(id: ExportPlatformId): string {
  return EXPORT_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

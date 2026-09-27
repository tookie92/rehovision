/**
 * Construction des prompts d'image cohérents avec le style du Studio.
 * Isolé pour ajuster le vocabulaire visuel sans toucher aux jobs.
 */

export function buildImagePrompt(args: {
  visualBeat: string;
  visualStyle: string;
  narrationTone: string;
}): string {
  return [
    args.visualBeat,
    `Style : ${args.visualStyle}`,
    `Ambiance narrative : ${args.narrationTone}`,
    "Format vertical 9:16, illustration narrative, pas de texte dans l'image, pas de filigrane.",
  ].join(". ");
}

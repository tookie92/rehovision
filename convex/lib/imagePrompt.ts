/**
 * Construction des prompts d'image cohérents avec le style du Studio.
 *
 * SDXL CLIP ≈ 77 tokens : le DÉBUT du prompt compte le plus.
 * → Style illustration EN PREMIER, beat court ensuite.
 *
 * Hiérarchie :
 * - Si référence uploadée → consignes ref (IP-Adapter / prompt).
 * - Sinon → `visualStyle` du studio (chips Anime/Comic/…).
 */

const ANTI_BIAS_SHORT =
  "no default European faces; match the scene described";

/** Garde le style assez court pour CLIP (évite que le beat mange le style). */
function shortenStyle(preset: string, maxChars = 160): string {
  const t = preset.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).replace(/,\s*$/, "")}…`;
}

function shortenBeat(beat: string, maxChars = 140): string {
  const t = beat.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).replace(/\s+\S*$/, "")}…`;
}

export function buildImagePrompt(args: {
  visualBeat: string;
  visualStyle: string;
  narrationTone: string;
  topic?: string;
  /** Studio a une image de référence de style de dessin */
  hasStyleReference?: boolean;
}): string {
  const beat = shortenBeat(args.visualBeat);
  const topic = args.topic?.trim();
  const mood = args.narrationTone.trim();
  const preset = shortenStyle(args.visualStyle);

  if (args.hasStyleReference) {
    return [
      "Match studio style-reference linework medium and palette",
      beat,
      topic ? `Topic: ${topic}` : null,
      "New scene — do not copy reference subjects",
      mood ? `Mood: ${mood}` : null,
      "vertical 9:16, no text, no watermark",
    ]
      .filter(Boolean)
      .join(". ");
  }

  // Style FIRST — sinon SDXL Turbo ignore les chips (CLIP truncates the end).
  return [
    preset ? `Illustration style: ${preset}` : null,
    beat,
    topic ? `Topic: ${topic}` : null,
    mood ? `Mood: ${mood}` : null,
    ANTI_BIAS_SHORT,
    "vertical 9:16, no text, no watermark",
  ]
    .filter(Boolean)
    .join(". ");
}

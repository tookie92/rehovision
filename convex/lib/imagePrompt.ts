/**
 * Construction des prompts d'image cohérents avec le style du Studio.
 *
 * Hiérarchie :
 * - Si référence de dessin uploadée → elle PRIME pour le medium/trait/couleurs.
 *   Le preset d'illustration ne sert plus qu'à l'ambiance (évite le conflit anime vs "3D réaliste").
 * - Sinon → le preset `visualStyle` définit le style.
 *
 * SDXL CLIP ≈ 77 tokens : garder le prompt COURT, scène en premier.
 */

const ANTI_BIAS_SHORT =
  "Respect place and people described; no default European faces or settings";

export function buildImagePrompt(args: {
  visualBeat: string;
  visualStyle: string;
  narrationTone: string;
  topic?: string;
  /** Studio a une image de référence de style de dessin */
  hasStyleReference?: boolean;
}): string {
  const beat = args.visualBeat.trim();
  const topic = args.topic?.trim();
  const mood = args.narrationTone.trim();
  const preset = args.visualStyle.trim();

  if (args.hasStyleReference) {
    // Référence = style de dessin. Preset = ambiance seulement (pas de medium concurrent).
    return [
      beat,
      topic ? `Topic: ${topic}` : null,
      "Drawing style from studio style-reference (linework, medium, palette)",
      "New scene and characters — do not copy the reference subjects or composition",
      mood ? `Mood: ${mood}` : null,
      "vertical 9:16, no text watermark",
    ]
      .filter(Boolean)
      .join(". ");
  }

  return [
    beat,
    topic ? `Topic: ${topic}` : null,
    preset ? `Illustration style: ${preset}` : null,
    mood ? `Mood: ${mood}` : null,
    ANTI_BIAS_SHORT,
    "vertical 9:16, no text watermark",
  ]
    .filter(Boolean)
    .join(". ");
}

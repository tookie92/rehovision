/**
 * Prompt image faceless : look d'abord (CLIP), puis cast lock, puis beat.
 * Les styles trop longs sont coupés par CLIP (~77 tokens) — le look doit gagner.
 */

import { formatCastLock, type CastMember } from "./facelessPresets";

export type ImagePromptInput = {
  visualBeat: string;
  visualStyle: string;
  narrationTone: string;
  topic: string;
  hasStyleReference?: boolean;
  cast?: CastMember[] | null;
  /** Tokens négatifs du look — ajoutés en fin de prompt pour Flux */
  negativePrompt?: string | null;
};

export function buildImagePrompt(input: ImagePromptInput): string {
  const beat = input.visualBeat.trim().slice(0, 220);
  const style = input.visualStyle.trim().slice(0, 200);
  const tone = input.narrationTone.trim().slice(0, 60);
  const topic = input.topic.trim().slice(0, 80);
  const castLock = formatCastLock(input.cast);

  const parts: string[] = [];

  // 1. Look / style — PRIORITÉ CLIP
  if (style) {
    parts.push(style);
  }

  // 2. Cast bible — cohérence personnages
  if (castLock) {
    parts.push(castLock);
  }

  // 3. Beat de scène
  if (beat) {
    parts.push(beat);
  }

  // 4. Contexte court
  const ctx: string[] = [];
  if (topic) ctx.push(`topic: ${topic}`);
  if (tone) ctx.push(`mood: ${tone}`);
  if (ctx.length) {
    parts.push(ctx.join(", "));
  }

  // 5. Qualité verticale
  parts.push(
    "vertical 9:16 composition, single clear subject, high quality illustration",
  );

  if (input.hasStyleReference) {
    parts.push("match the attached style reference");
  }

  // 6. Négatifs (Flux n'a pas de canal négatif → en texte)
  if (input.negativePrompt?.trim()) {
    parts.push(`avoid: ${input.negativePrompt.trim().slice(0, 160)}`);
  }

  return parts.join(". ").replace(/\s+/g, " ").trim();
}

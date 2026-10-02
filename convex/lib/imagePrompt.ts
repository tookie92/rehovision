/**
 * Prompt image faceless : look ENTIER d'abord (répété pour poids Flux), puis beat court.
 * Flux ignore le canal négatif → NOT … en tête depuis negativePrompt.
 */

import { formatCastLock, type CastMember } from "./facelessPresets";

export type ImagePromptInput = {
  visualBeat: string;
  visualStyle: string;
  narrationTone: string;
  topic: string;
  hasStyleReference?: boolean;
  cast?: CastMember[] | null;
  negativePrompt?: string | null;
};

/** Extrait une année / époque du sujet pour ancrer les images. */
export function extractPeriodLock(topic: string): string | null {
  const t = topic.trim();
  if (!t) return null;
  const year = t.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
  if (year) {
    const y = year[1]!;
    return `year ${y} period-accurate props only`;
  }
  if (/\b(xixe|19e|19ème|dix-neuvième|victorian|belle époque)\b/i.test(t)) {
    return `late 1800s period-accurate props only`;
  }
  return null;
}

const PERIOD_AVOID =
  "modern car, smartphone, LED, sneakers, jeans, hoodie";

/** Convertit negativePrompt en préfixe NOT (Flux n'a pas de vrai negative). */
function notPrefix(negativePrompt: string | null | undefined): string | null {
  if (!negativePrompt?.trim()) return null;
  const tokens = negativePrompt
    .split(/,/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `NOT ${t}`).join(", ");
}

export function buildImagePrompt(input: ImagePromptInput): string {
  const style = input.visualStyle.trim();
  // Beat court : sinon le sujet (école, kids…) écrase le look.
  const beat = input.visualBeat.trim().slice(0, 80);
  const topic = input.topic.trim().slice(0, 40);
  const castLock = formatCastLock(input.cast);
  const periodLock = extractPeriodLock(input.topic);
  const anti = notPrefix(input.negativePrompt);

  const parts: string[] = [];
  if (anti) parts.push(anti);
  // Répéter le look = poids CLIP/Flux (évite collapse anime/generic).
  if (style) {
    parts.push(style);
    parts.push(style);
  }
  if (periodLock) parts.push(periodLock);
  if (castLock) parts.push(castLock);
  if (beat) parts.push(beat);
  if (topic) parts.push(`topic: ${topic}`);

  parts.push("vertical 9:16");

  if (input.hasStyleReference) {
    parts.push("match the attached style reference");
  }

  if (periodLock) {
    parts.push(`avoid: ${PERIOD_AVOID}`);
  }

  return parts.join(". ").replace(/\s+/g, " ").trim();
}

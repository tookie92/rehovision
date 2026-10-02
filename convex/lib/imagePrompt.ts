/**
 * Prompt image faceless : look ENTIER d'abord (Flux truncate), puis époque/cast/beat.
 * Flux ignore le canal négatif → anti-tokens dans le positif (NOT …) en tête.
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
    return `set strictly in year ${y}, period-accurate clothes buildings props only`;
  }
  if (/\b(xixe|19e|19ème|dix-neuvième|victorian|belle époque)\b/i.test(t)) {
    return `set strictly in late 1800s, period-accurate clothes buildings props only`;
  }
  return null;
}

const PERIOD_AVOID =
  "modern car, automobile, SUV, smartphone, plastic, LED screen, sneakers, jeans, hoodie, contemporary clothing";

/** Convertit negativePrompt en préfixe NOT (Flux n'a pas de vrai negative). */
function notPrefix(negativePrompt: string | null | undefined): string | null {
  if (!negativePrompt?.trim()) return null;
  const tokens = negativePrompt
    .split(/,|\band\b/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `NOT ${t}`).join(", ");
}

export function buildImagePrompt(input: ImagePromptInput): string {
  // Style : ne PAS truncater (signatures graphiques perdues → collapse anime).
  const style = input.visualStyle.trim();
  const beat = input.visualBeat.trim().slice(0, 120);
  const tone = input.narrationTone.trim().slice(0, 30);
  const topic = input.topic.trim().slice(0, 50);
  const castLock = formatCastLock(input.cast);
  const periodLock = extractPeriodLock(input.topic);
  const anti = notPrefix(input.negativePrompt);

  const parts: string[] = [];
  // Anti-collapse EN TÊTE, puis look complet, puis contenu.
  if (anti) parts.push(anti);
  if (style) parts.push(style);
  if (periodLock) parts.push(periodLock);
  if (castLock) parts.push(castLock);
  if (beat) parts.push(beat);

  const ctx: string[] = [];
  if (topic) ctx.push(`topic: ${topic}`);
  if (tone) ctx.push(`mood: ${tone}`);
  if (ctx.length) parts.push(ctx.join(", "));

  parts.push("vertical 9:16, same art style every frame");

  if (input.hasStyleReference) {
    parts.push("match the attached style reference");
  }

  if (periodLock) {
    parts.push(`avoid: ${PERIOD_AVOID}`);
  }

  return parts.join(". ").replace(/\s+/g, " ").trim();
}

/**
 * Prompt image faceless : look d'abord (CLIP), puis cast lock + ancrage époque, puis beat.
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

/** Extrait une année / époque du sujet pour ancrer les images (Flux ignore le negative). */
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

export function buildImagePrompt(input: ImagePromptInput): string {
  const beat = input.visualBeat.trim().slice(0, 160);
  const style = input.visualStyle.trim().slice(0, 160);
  const tone = input.narrationTone.trim().slice(0, 40);
  const topic = input.topic.trim().slice(0, 60);
  const castLock = formatCastLock(input.cast);
  const periodLock = extractPeriodLock(input.topic);

  // Style d'abord (CLIP / Flux truncation), puis époque + cast, puis beat.
  const parts: string[] = [];
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

  const avoidBits: string[] = [];
  if (input.negativePrompt?.trim()) {
    avoidBits.push(input.negativePrompt.trim().slice(0, 120));
  }
  if (periodLock) avoidBits.push(PERIOD_AVOID);
  if (avoidBits.length) {
    parts.push(`avoid: ${avoidBits.join(", ")}`);
  }

  return parts.join(". ").replace(/\s+/g, " ").trim();
}

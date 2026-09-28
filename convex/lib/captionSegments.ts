/**
 * Extrait les segments Whisper qui chevauchent une fenêtre de clip.
 * Conserve les words si présents (captions karaoke).
 */

export type CaptionWord = {
  word: string;
  start: number;
  end: number;
};

export type CaptionSegment = {
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseWords(raw: unknown): CaptionWord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const words: CaptionWord[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const rec = w as Record<string, unknown>;
    const word = String(rec.word ?? rec.text ?? "").trim();
    const start = asNumber(rec.start);
    const end = asNumber(rec.end);
    if (!word || start === null || end === null) continue;
    words.push({ word, start, end: Math.max(end, start + 0.05) });
  }
  return words.length > 0 ? words : undefined;
}

export function sliceCaptionSegments(
  transcript: unknown,
  startSec: number,
  endSec: number,
): CaptionSegment[] {
  if (!transcript || typeof transcript !== "object") return [];
  const segments = (transcript as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return [];

  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const rec = seg as Record<string, unknown>;
    const start = asNumber(rec.start);
    const end = asNumber(rec.end);
    const text = String(rec.text ?? "").trim();
    if (start === null || end === null || !text) continue;
    if (end < startSec || start > endSec) continue;

    const words = parseWords(rec.words)?.filter(
      (w) => w.end >= startSec && w.start <= endSec,
    );

    out.push({
      start,
      end,
      text,
      ...(words && words.length > 0 ? { words } : {}),
    });
  }
  return out;
}

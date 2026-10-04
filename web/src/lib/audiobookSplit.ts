/** Découpe client miroir de worker/engines/audiobook.py (aperçu segments). */

export type AudiobookChapter = {
  title: string;
  text: string;
  speaker: string;
};

export const NARRATOR_KEY = "Narrateur";

const CHAPTER_RE =
  /^(?:#{1,3}\s+|(?:chapitre|chapter|partie|part)\s+\d+\s*[:.\-—]?\s*)(.+)$/i;
const SPEAKER_RE =
  /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’\- ]{0,39}?)\s*[:：—–]\s+(.+)$/;

const SKIP_SPEAKERS = new Set([
  "http",
  "https",
  "note",
  "ps",
  "nb",
  "ex",
  "exemples",
]);

function normSpeaker(name: string): string {
  const s = name.trim();
  if (!s) return NARRATOR_KEY;
  return s.length > 1 ? s[0].toUpperCase() + s.slice(1) : s.toUpperCase();
}

function splitLong(text: string, maxChars: number): string[] {
  const t = text.trim();
  if (t.length <= maxChars) return [t];
  const sentences = t.split(/(?<=[.!?…])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (!cur) cur = s;
    else if (cur.length + 1 + s.length <= maxChars) cur = `${cur} ${s}`;
    else {
      chunks.push(cur);
      cur = s;
    }
  }
  if (cur) chunks.push(cur);
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxChars) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += maxChars) {
      const piece = c.slice(i, i + maxChars).trim();
      if (piece) out.push(piece);
    }
  }
  return out;
}

function splitDialogueTurns(body: string): { speaker: string; text: string }[] {
  const turns: { speaker: string; text: string }[] = [];
  let curSpeaker = NARRATOR_KEY;
  let cur: string[] = [];

  const flush = () => {
    const text = cur.join("\n").trim();
    if (text) turns.push({ speaker: curSpeaker, text });
    cur = [];
  };

  for (const line of body.split("\n")) {
    const stripped = line.trim();
    if (!stripped) {
      flush();
      curSpeaker = NARRATOR_KEY;
      continue;
    }
    const m = stripped.match(SPEAKER_RE);
    if (m) {
      flush();
      const name = normSpeaker(m[1] || "");
      if (SKIP_SPEAKERS.has(name.toLowerCase())) {
        curSpeaker = NARRATOR_KEY;
        cur = [stripped];
      } else {
        curSpeaker = name;
        cur = [(m[2] || "").trim()];
      }
      continue;
    }
    cur.push(stripped);
  }
  flush();
  return turns;
}

/** Noms détectés via « Nom: réplique » (sans Narrateur). */
export function detectSpeakers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.trim().match(SPEAKER_RE);
    if (!m) continue;
    const key = normSpeaker(m[1] || "");
    const low = key.toLowerCase();
    if (seen.has(low) || low === NARRATOR_KEY.toLowerCase()) continue;
    if (SKIP_SPEAKERS.has(low)) continue;
    seen.add(low);
    found.push(key);
  }
  return found;
}

export function splitAudiobookText(
  text: string,
  maxChars = 600,
): AudiobookChapter[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const lines = raw.split("\n");
  type Sec = { title: string; body: string };
  const sections: Sec[] = [];
  let currentTitle = "Chapitre 1";
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ title: currentTitle, body });
    buf = [];
  };

  for (const line of lines) {
    const m = line.trim().match(CHAPTER_RE);
    if (m) {
      flush();
      currentTitle = (m[1] || line.trim().replace(/^#+\s*/, "")).trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  if (!sections.length) sections.push({ title: "Chapitre 1", body: raw });

  const chapters: AudiobookChapter[] = [];
  for (const sec of sections) {
    const turns = splitDialogueTurns(sec.body);
    if (!turns.length) continue;

    if (turns.length === 1 && turns[0].speaker === NARRATOR_KEY) {
      let paras = sec.body
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (paras.length <= 1 && sec.body.length > maxChars) {
        paras = splitLong(sec.body, maxChars);
      }
      if (sections.length === 1 && paras.length > 1) {
        paras.forEach((para, i) => {
          for (const piece of splitLong(para, maxChars)) {
            chapters.push({
              title: `Paragraphe ${i + 1}`,
              text: piece,
              speaker: NARRATOR_KEY,
            });
          }
        });
        continue;
      }
      paras.forEach((para, i) => {
        const pieces = splitLong(para, maxChars);
        pieces.forEach((piece, j) => {
          let label =
            i === 0 && j === 0 ? sec.title : `${sec.title} · ${i + 1}`;
          if (pieces.length > 1) label = `${label}.${j + 1}`;
          chapters.push({
            title: label,
            text: piece,
            speaker: NARRATOR_KEY,
          });
        });
      });
      continue;
    }

    for (const turn of turns) {
      const pieces = splitLong(turn.text, maxChars);
      pieces.forEach((piece, j) => {
        let label: string;
        if (turn.speaker === NARRATOR_KEY) {
          label = j === 0 ? sec.title : `${sec.title} · ${j + 1}`;
        } else {
          label =
            j === 0
              ? `${sec.title} · ${turn.speaker}`
              : `${sec.title} · ${turn.speaker}.${j + 1}`;
        }
        chapters.push({
          title: label,
          text: piece,
          speaker: turn.speaker,
        });
      });
    }
  }
  return chapters;
}

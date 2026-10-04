/** Découpe client miroir de worker/engines/audiobook.py (aperçu segments). */

export type AudiobookChapter = {
  title: string;
  text: string;
};

const CHAPTER_RE =
  /^(?:#{1,3}\s+|(?:chapitre|chapter|partie|part)\s+\d+\s*[:.\-—]?\s*)(.+)$/i;

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
          chapters.push({ title: `Paragraphe ${i + 1}`, text: piece });
        }
      });
      continue;
    }
    paras.forEach((para, i) => {
      const pieces = splitLong(para, maxChars);
      pieces.forEach((piece, j) => {
        let label = i === 0 && j === 0 ? sec.title : `${sec.title} · ${i + 1}`;
        if (pieces.length > 1) label = `${label}.${j + 1}`;
        chapters.push({ title: label, text: piece });
      });
    });
  }
  return chapters;
}

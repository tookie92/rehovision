/**
 * Prompt utilisateur script + parsing JSON.
 * Le system prompt vient de genrePrompt.ts
 * Cast bible = cohérence personnages entre scènes.
 */

export type CastMember = {
  id: string;
  name: string;
  appearance: string;
  clothing: string;
};

export function buildScriptUserPrompt(args: {
  topic: string;
  title?: string;
  narrationTone: string;
  visualStyle: string;
  genre?: string;
}): string {
  return [
    `Sujet : ${args.topic}`,
    args.title ? `Titre souhaité : ${args.title}` : null,
    args.genre ? `Genre Studio : ${args.genre}` : null,
    `Ton de narration du Studio : ${args.narrationTone}`,
    `Style visuel du Studio (pour guider les visualBeat) : ${args.visualStyle}`,
    ``,
    `Contraintes critiques :`,
    `- Extrais du sujet tout lieu, époque et personne réelle ; ancre narration + visualBeat dessus.`,
    `- Interdit : décors / visages européens génériques si le sujet n'est pas européen.`,
    `- Pour une personne réelle : visualBeat = portrait / scène reconnaissable (traits, époque), pas un visage inventé.`,
    `- Génère un script complet découpé en scènes.`,
    ``,
    `CAST BIBLE (obligatoire pour la cohérence visuelle) :`,
    `- Inclus un tableau "cast" avec 1–3 personnages (souvent 1 sujet principal).`,
    `- Chaque personnage : id, name, appearance (EN ANGLAIS, âge/teint/cheveux/traits, max 25 mots), clothing (EN ANGLAIS, tenue récurrente, max 12 mots).`,
    `- Les visualBeat DOIVENT réutiliser ces personnages par leur name — mêmes traits / tenue d'une scène à l'autre.`,
    `- Si le sujet n'a pas de personnage humain : "cast": [].`,
    ``,
    `Réponds UNIQUEMENT en JSON valide (pas de markdown) :`,
    `{`,
    `  "title": "...",`,
    `  "cast": [{ "id": "char_1", "name": "...", "appearance": "...", "clothing": "..." }],`,
    `  "scenes": [{ "order": 1, "narrationText": "...", "visualBeat": "..." }]`,
    `}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export type GeneratedScene = {
  order: number;
  narrationText: string;
  visualBeat: string;
};

export type GeneratedScript = {
  title: string;
  cast: CastMember[];
  scenes: GeneratedScene[];
};

function parseCast(raw: unknown): CastMember[] {
  if (!Array.isArray(raw)) return [];
  const out: CastMember[] = [];
  for (let i = 0; i < Math.min(raw.length, 3); i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const appearance =
      typeof o.appearance === "string" ? o.appearance.trim() : "";
    const clothing = typeof o.clothing === "string" ? o.clothing.trim() : "";
    if (!name && !appearance) continue;
    out.push({
      id:
        typeof o.id === "string" && o.id.trim()
          ? o.id.trim()
          : `char_${i + 1}`,
      name: name || `Character ${i + 1}`,
      appearance: appearance.slice(0, 200),
      clothing: clothing.slice(0, 120),
    });
  }
  return out;
}

export function parseGeneratedScript(raw: string): GeneratedScript {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsed = JSON.parse(cleaned) as {
    title?: string;
    cast?: unknown;
    scenes?: GeneratedScene[];
  };

  if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Réponse LLM invalide : title/scenes manquants");
  }

  return {
    title: parsed.title,
    cast: parseCast(parsed.cast),
    scenes: parsed.scenes.map((scene, index) => ({
      order: scene.order ?? index + 1,
      narrationText: scene.narrationText?.trim() ?? "",
      visualBeat: scene.visualBeat?.trim() ?? "",
    })),
  };
}

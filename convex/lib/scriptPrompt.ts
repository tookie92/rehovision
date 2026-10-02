/**
 * Prompt utilisateur script + parsing JSON.
 * Le system prompt vient de genrePrompt.ts
 * Cast bible = cohérence personnages entre scènes.
 * Épisodes = contexte série injecté si episodeNumber > 1.
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
  episodeNumber?: number | null;
  previousEpisodeSummary?: string | null;
  lockedCast?: CastMember[] | null;
}): string {
  const ep = args.episodeNumber ?? 1;
  const isSequel = ep > 1;

  const lines: Array<string | null> = [
    `Sujet : ${args.topic}`,
    args.title ? `Titre souhaité : ${args.title}` : null,
    args.genre ? `Genre Studio : ${args.genre}` : null,
    `Ton de narration du Studio : ${args.narrationTone}`,
    `Style visuel du Studio (pour guider les visualBeat) : ${args.visualStyle}`,
    isSequel ? `Épisode : ${ep} (suite d'une série)` : `Épisode : 1 (premier de la série)`,
    ``,
    `Contraintes critiques :`,
    `- Extrais du sujet tout lieu, époque et personne réelle ; ancre narration + visualBeat dessus.`,
    `- Interdit : décors / visages européens génériques si le sujet n'est pas européen.`,
    `- Pour une personne réelle : visualBeat = portrait / scène reconnaissable (traits, époque), pas un visage inventé.`,
    `- Accroche scène 1 = UNE phrase qui accroche. Fin = chute forte OU cliffhanger (sauf kids = fin douce).`,
    `- Génère un script complet découpé en scènes (cible 6–8 pour true crime / history / custom).`,
  ];

  if (isSequel) {
    lines.push(
      ``,
      `CONTEXTE SÉRIE (épisode ${ep}) :`,
      `- Résumé de l'épisode précédent : ${args.previousEpisodeSummary?.trim() || "(non fourni — continue logiquement le sujet)"}`,
      `- Résous ou prolonge le cliffhanger précédent ; termine par un NOUVEAU cliffhanger ou une chute forte.`,
      `- Garde le même univers, les mêmes personnages, le même ton.`,
    );
  }

  if (args.lockedCast && args.lockedCast.length > 0) {
    lines.push(
      ``,
      `CAST FIGÉ (ne pas inventer de nouveaux personnages — réutilise exactement) :`,
      JSON.stringify(args.lockedCast),
      `- Le champ "cast" du JSON DOIT être identique (mêmes id, name, appearance, clothing).`,
    );
  } else {
    lines.push(
      ``,
      `CAST BIBLE (obligatoire pour la cohérence visuelle) :`,
      `- Inclus un tableau "cast" avec 1–3 personnages (souvent 1 sujet principal).`,
      `- Chaque personnage : id, name, appearance (EN ANGLAIS, âge/teint/cheveux/traits, max 25 mots), clothing (EN ANGLAIS, tenue récurrente, max 12 mots).`,
      `- Les visualBeat DOIVENT réutiliser ces personnages par leur name — mêmes traits / tenue d'une scène à l'autre.`,
      `- Si le sujet n'a pas de personnage humain : "cast": [].`,
    );
  }

  lines.push(
    ``,
    `Réponds UNIQUEMENT en JSON valide (pas de markdown) :`,
    `{`,
    `  "title": "...",`,
    `  "cast": [{ "id": "char_1", "name": "...", "appearance": "...", "clothing": "..." }],`,
    `  "scenes": [{ "order": 1, "narrationText": "...", "visualBeat": "..." }]`,
    `}`,
  );

  return lines.filter((line) => line !== null).join("\n");
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

/** Résumé court des dernières scènes pour l'épisode suivant. */
export function summarizeScenesForNextEpisode(
  scenes: Array<{ narrationText: string }>,
  maxChars = 400,
): string {
  const texts = scenes
    .map((s) => s.narrationText.trim())
    .filter(Boolean);
  if (texts.length === 0) return "";
  const last = texts.slice(-3).join(" ");
  if (last.length <= maxChars) return last;
  return `${last.slice(0, maxChars - 1)}…`;
}

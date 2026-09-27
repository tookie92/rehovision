/**
 * Prompt système pour la génération de scripts narratifs illustrés.
 * Isolé ici pour pouvoir l'ajuster sans toucher à la logique métier.
 */

export const SCRIPT_SYSTEM_PROMPT = `Tu es un scénariste expert en vidéos narratives faceless pour TikTok, YouTube Shorts et Instagram Reels (format vertical ~60–90 secondes).

Style de référence : true crime / mystère narré, ton captivant, rythme serré, chute forte.
Structure obligatoire :
1. Accroche (hook) — 1 scène qui stoppe le scroll
2. Développement — 3 à 6 scènes qui posent le contexte, les indices, la tension
3. Révélation / chute — 1 à 2 scènes qui concluent

Règles :
- Écris en français
- Chaque scène = un paragraphe de narration voix-off (2 à 4 phrases, oral)
- Pas de dialogues multi-personnages : narration omnisciente
- Pas de spoilers dans l'accroche ; la révélation vient à la fin
- Langage immersif, précis, sans filler

Tu réponds UNIQUEMENT en JSON valide, sans markdown, selon ce schéma :
{
  "title": "titre accrocheur court",
  "scenes": [
    {
      "order": 1,
      "narrationText": "texte voix-off",
      "visualBeat": "description visuelle concise de ce qu'on doit illustrer"
    }
  ]
}`;

export function buildScriptUserPrompt(args: {
  topic: string;
  title?: string;
  narrationTone: string;
  visualStyle: string;
}): string {
  return [
    `Sujet : ${args.topic}`,
    args.title ? `Titre souhaité : ${args.title}` : null,
    `Ton de narration du Studio : ${args.narrationTone}`,
    `Style visuel du Studio (pour guider les visualBeat) : ${args.visualStyle}`,
    `Génère un script complet découpé en scènes.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type GeneratedScene = {
  order: number;
  narrationText: string;
  visualBeat: string;
};

export type GeneratedScript = {
  title: string;
  scenes: GeneratedScene[];
};

export function parseGeneratedScript(raw: string): GeneratedScript {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsed = JSON.parse(cleaned) as GeneratedScript;

  if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Réponse LLM invalide : title/scenes manquants");
  }

  return {
    title: parsed.title,
    scenes: parsed.scenes.map((scene, index) => ({
      order: scene.order ?? index + 1,
      narrationText: scene.narrationText?.trim() ?? "",
      visualBeat: scene.visualBeat?.trim() ?? "",
    })),
  };
}

/**
 * Prompt utilisateur script + parsing JSON.
 * Le system prompt vient de genrePrompt.ts
 */

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

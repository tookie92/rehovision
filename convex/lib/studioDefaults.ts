/**
 * Defaults Studio pour le flux sujet → reel (sans config UI obligatoire).
 * Aligné sur le preset "gravure" de src/lib/stylePresets.ts.
 */
export const DEFAULT_STUDIO_NAME = "Défaut";

export const DEFAULT_STUDIO = {
  name: DEFAULT_STUDIO_NAME,
  genre: "true_crime" as const,
  visualStyle:
    "gravures sombres type etching, palette rouge et noir, contraste élevé, grain film, ambiance mystérieuse",
  narrationTone: "grave, mystérieux",
};

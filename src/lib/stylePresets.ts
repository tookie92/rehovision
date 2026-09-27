/**
 * Presets de style d'illustration pour les Studios.
 * Le champ `prompt` est injecté dans visualStyle / prompts d'image.
 */

export type StylePreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
  toneHint: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "gravure",
    label: "Gravure sombre",
    description: "True crime classique, contraste élevé",
    prompt:
      "gravures sombres type etching, palette rouge et noir, contraste élevé, grain film, ambiance mystérieuse",
    toneHint: "grave, mystérieux",
  },
  {
    id: "noir-polaroid",
    label: "Polaroid grain",
    description: "Photos vintage, flash direct",
    prompt:
      "polaroids vintage grainés, flash cru, couleurs désaturées, bords usés, esthétique cold case",
    toneHint: "posé, documentaire",
  },
  {
    id: "comic-ombre",
    label: "Comic noir",
    description: "Encrage fort, ombres portées",
    prompt:
      "illustration comic noir, encrage gras, ombres dramatiques, palette limitée noir/blanc/sang, style graphic novel",
    toneHint: "intense, rythmé",
  },
  {
    id: "brume",
    label: "Brume urbaine",
    description: "Nuit pluvieuse, néons faibles",
    prompt:
      "scène urbaine nocturne, pluie, brume, néons faibles, réalisme cinématographique sombre, shallow depth of field",
    toneHint: "froid, narratif",
  },
  {
    id: "custom",
    label: "Personnalisé",
    description: "Décris ton univers librement",
    prompt: "",
    toneHint: "",
  },
];

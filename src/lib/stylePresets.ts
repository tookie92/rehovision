/**
 * Presets de style d'illustration pour les Studios.
 * Filtrables par genre.
 */

import type { GenreId } from "@/lib/genrePresets";

export type StylePreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
  toneHint: string;
  genres: GenreId[];
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "gravure",
    label: "Gravure sombre",
    description: "True crime classique, contraste élevé",
    prompt:
      "gravures sombres type etching, palette rouge et noir, contraste élevé, grain film, ambiance mystérieuse",
    toneHint: "grave, mystérieux",
    genres: ["true_crime", "history", "custom"],
  },
  {
    id: "noir-polaroid",
    label: "Polaroid grain",
    description: "Photos vintage, flash direct",
    prompt:
      "polaroids vintage grainés, flash cru, couleurs désaturées, bords usés, esthétique cold case",
    toneHint: "posé, documentaire",
    genres: ["true_crime", "history", "custom"],
  },
  {
    id: "comic-ombre",
    label: "Comic noir",
    description: "Encrage fort, ombres portées",
    prompt:
      "illustration comic noir, encrage gras, ombres dramatiques, palette limitée noir/blanc/sang, style graphic novel",
    toneHint: "intense, rythmé",
    genres: ["true_crime", "custom"],
  },
  {
    id: "brume",
    label: "Brume urbaine",
    description: "Nuit pluvieuse, néons faibles",
    prompt:
      "scène urbaine nocturne, pluie, brume, néons faibles, réalisme cinématographique sombre, shallow depth of field",
    toneHint: "froid, narratif",
    genres: ["true_crime", "history", "custom"],
  },
  {
    id: "conte-doux",
    label: "Conte doux",
    description: "Pastel, formes rondes, chaleureux",
    prompt:
      "illustration jeunesse pastel, formes douces, couleurs vives mais douces, personnages stylisés mignons, lumière chaude, fond simple",
    toneHint: "chaleureux, joyeux",
    genres: ["kids", "custom"],
  },
  {
    id: "papier-decoupe",
    label: "Papier découpé",
    description: "Craft kids, textures papier",
    prompt:
      "style paper cut craft pour enfants, couches de papier coloré, ombres douces, look stop-motion amical, palette joyeuse",
    toneHint: "doux, curieux",
    genres: ["kids", "custom"],
  },
  {
    id: "3d-soft",
    label: "3D soft",
    description: "Rendu 3D stylisé type animation familiale",
    prompt:
      "3D stylized animation soft lighting, cute rounded characters, clean colorful sets, family-friendly, no horror",
    toneHint: "enjoué, clair",
    genres: ["kids", "custom"],
  },
  {
    id: "custom",
    label: "Personnalisé",
    description: "Décris ton univers librement",
    prompt: "",
    toneHint: "",
    genres: ["true_crime", "kids", "history", "custom"],
  },
];

export function presetsForGenre(genre: GenreId): StylePreset[] {
  return STYLE_PRESETS.filter((p) => p.genres.includes(genre));
}

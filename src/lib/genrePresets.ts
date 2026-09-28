/**
 * Genres Studio (miroir côté UI — labels + hints).
 */

export type GenreId = "true_crime" | "kids" | "history" | "custom";

export type GenrePreset = {
  id: GenreId;
  label: string;
  description: string;
  defaultTone: string;
};

export const GENRE_PRESETS: GenrePreset[] = [
  {
    id: "true_crime",
    label: "True crime / mystère",
    description: "Tension, hook fort, chute",
    defaultTone: "grave, mystérieux",
  },
  {
    id: "kids",
    label: "Enfants",
    description: "Conte doux, éducatif, positif",
    defaultTone: "chaleureux, joyeux",
  },
  {
    id: "history",
    label: "Histoire",
    description: "Mini-doc, faits + storytelling",
    defaultTone: "posé, documentaire",
  },
  {
    id: "custom",
    label: "Libre",
    description: "Le ton du Studio guide tout",
    defaultTone: "",
  },
];

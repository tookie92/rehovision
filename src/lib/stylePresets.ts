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

/** Looks atelier faceless — chips Style (phase 1). */
export type IllustrationLookId =
  | "anime"
  | "comic"
  | "realistic"
  | "pixar"
  | "gravure"
  | "conte";

export type IllustrationLook = {
  id: IllustrationLookId;
  label: string;
  hint: string;
  prompt: string;
  toneHint: string;
};

export const ILLUSTRATION_LOOKS: IllustrationLook[] = [
  {
    id: "anime",
    label: "Anime",
    hint: "Ligne claire, cel-shading",
    prompt:
      "anime illustration, clean linework, cel shading, expressive eyes, vivid but controlled palette, vertical 9:16 composition, no text, no watermark",
    toneHint: "expressif, clair",
  },
  {
    id: "comic",
    label: "Comic",
    hint: "Graphic novel, encrage fort",
    prompt:
      "comic book illustration, bold ink outlines, dramatic shadows, limited palette, graphic novel panel energy, vertical 9:16, no text, no watermark",
    toneHint: "intense, rythmé",
  },
  {
    id: "realistic",
    label: "Réaliste",
    hint: "Photo ciné, DOF",
    prompt:
      "cinematic photorealistic still, natural lighting, shallow depth of field, film grain subtle, vertical 9:16 composition, no text, no watermark",
    toneHint: "posé, narratif",
  },
  {
    id: "pixar",
    label: "Pixar",
    hint: "3D soft familial",
    prompt:
      "Pixar-style 3D animation still, soft global illumination, rounded friendly forms, clean colorful set, family-friendly, vertical 9:16, no text, no watermark",
    toneHint: "enjoué, clair",
  },
  {
    id: "gravure",
    label: "Gravure",
    hint: "True crime sombre",
    prompt:
      "dark etching engraving style, red and black palette, high contrast, film grain, mysterious atmosphere, vertical 9:16, no text, no watermark",
    toneHint: "grave, mystérieux",
  },
  {
    id: "conte",
    label: "Conte",
    hint: "Pastel jeunesse",
    prompt:
      "soft pastel children's storybook illustration, rounded shapes, warm light, simple background, cute stylized characters, vertical 9:16, no text, no watermark",
    toneHint: "chaleureux, joyeux",
  },
];

export function matchIllustrationLook(
  visualStyle: string | undefined | null,
): IllustrationLookId | null {
  if (!visualStyle?.trim()) return null;
  const v = visualStyle.toLowerCase();
  for (const look of ILLUSTRATION_LOOKS) {
    if (visualStyle.trim() === look.prompt) return look.id;
    if (v.includes(look.id) || v.includes(look.label.toLowerCase())) {
      return look.id;
    }
  }
  if (v.includes("anime") || v.includes("manga")) return "anime";
  if (v.includes("comic") || v.includes("graphic novel")) return "comic";
  if (v.includes("pixar") || v.includes("3d stylized")) return "pixar";
  if (v.includes("photoreal") || v.includes("cinematic photo"))
    return "realistic";
  if (v.includes("etching") || v.includes("gravure")) return "gravure";
  if (v.includes("pastel") || v.includes("storybook")) return "conte";
  return null;
}

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

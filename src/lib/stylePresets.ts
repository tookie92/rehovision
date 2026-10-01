/**
 * Presets de style — Studios avancés + réexport looks/voix faceless.
 */

import type { GenreId } from "@/lib/genrePresets";
import {
  FACELESS_LOOKS,
  FACELESS_VOICES,
  DEFAULT_FACELESS_LOOK_ID,
  DEFAULT_FACELESS_VOICE_ID,
  getFacelessLook,
  getFacelessVoice,
  matchFacelessLookId,
  matchFacelessVoiceId,
  type FacelessLookId,
  type FacelessLook,
  type FacelessVoiceId,
  type FacelessVoice,
} from "@/lib/facelessPresets";

export type StylePreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
  toneHint: string;
  genres: GenreId[];
};

/** @deprecated use FacelessLookId — alias pour l’atelier */
export type IllustrationLookId = FacelessLookId;
/** @deprecated use FacelessLook */
export type IllustrationLook = FacelessLook;

/** Looks atelier = catalogue viral unique */
export const ILLUSTRATION_LOOKS: IllustrationLook[] = FACELESS_LOOKS;

export const VOICE_PRESETS = FACELESS_VOICES;

export {
  FACELESS_LOOKS,
  FACELESS_VOICES,
  DEFAULT_FACELESS_LOOK_ID,
  DEFAULT_FACELESS_VOICE_ID,
  getFacelessLook,
  getFacelessVoice,
  matchFacelessLookId,
  matchFacelessVoiceId,
};
export type { FacelessLookId, FacelessLook, FacelessVoiceId, FacelessVoice };

export function matchIllustrationLook(
  visualStyle: string | undefined | null,
): FacelessLookId | null {
  return matchFacelessLookId(visualStyle);
}

/** Presets page Studios (avancé) — alignés sur les looks viraux. */
export const STYLE_PRESETS: StylePreset[] = [
  ...FACELESS_LOOKS.map((look) => ({
    id: look.id,
    label: look.label,
    description: look.hint,
    prompt: look.prompt,
    toneHint: look.toneHint,
    genres: [look.genre, "custom"] as GenreId[],
  })),
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

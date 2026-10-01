/**
 * Defaults Studio pour le flux sujet → reel.
 * Aligné sur FACELESS_LOOKS / VOICES (défaut = Anime + Narrateur grave).
 */

import {
  DEFAULT_FACELESS_LOOK_ID,
  DEFAULT_FACELESS_VOICE_ID,
  getFacelessLook,
  getFacelessVoice,
} from "./facelessPresets";

export const DEFAULT_STUDIO_NAME = "Défaut";

const look = getFacelessLook(DEFAULT_FACELESS_LOOK_ID);
const voice = getFacelessVoice(DEFAULT_FACELESS_VOICE_ID);

export const DEFAULT_STUDIO = {
  name: DEFAULT_STUDIO_NAME,
  genre: look.genre,
  visualStyle: look.prompt,
  narrationTone: look.toneHint,
  voiceInstruct: voice.instruct,
  lookId: look.id,
  voiceId: voice.id,
};

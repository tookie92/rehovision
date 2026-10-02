/**
 * Defaults Studio pour le flux sujet → reel.
 * Style = upload ref (pas de preset look) ; voix = Narrateur grave.
 */

import {
  DEFAULT_FACELESS_VOICE_ID,
  getFacelessVoice,
  UPLOAD_STYLE_PROMPT,
} from "./facelessPresets";

export const DEFAULT_STUDIO_NAME = "Défaut";

const voice = getFacelessVoice(DEFAULT_FACELESS_VOICE_ID);

export const DEFAULT_STUDIO = {
  name: DEFAULT_STUDIO_NAME,
  genre: "custom" as const,
  visualStyle: UPLOAD_STYLE_PROMPT,
  narrationTone: voice.instruct,
  voiceInstruct: voice.instruct,
  voiceId: voice.id,
};

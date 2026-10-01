/**
 * Presets faceless : looks viraux + voix OmniVoice.
 * Source de vérité côté Convex (importé aussi depuis src/lib).
 */

export type FacelessLookId =
  | "anime"
  | "comic"
  | "cinematic"
  | "clay3d"
  | "flatvector"
  | "surreal"
  | "storybook"
  | "noirphoto";

export type FacelessVoiceId =
  | "narrator_m"
  | "narrator_f"
  | "docu"
  | "intense"
  | "whisper"
  | "young_f"
  | "story";

export type FacelessLook = {
  id: FacelessLookId;
  label: string;
  hint: string;
  prompt: string;
  /** Ton narration pour le script Ollama */
  toneHint: string;
  genre: "true_crime" | "kids" | "history" | "custom";
};

export type FacelessVoice = {
  id: FacelessVoiceId;
  label: string;
  hint: string;
  /** Instruct OmniVoice voice-design — doit être très distinct entre presets */
  instruct: string;
  /** Vitesse TTS (audible même si le timbre est proche) */
  speed: number;
};

export const FACELESS_LOOKS: FacelessLook[] = [
  {
    id: "anime",
    label: "Anime",
    hint: "Ligne claire, cel-shading — tops TikTok",
    prompt:
      "anime illustration, clean linework, cel shading, expressive eyes, vivid but controlled palette, vertical 9:16 composition, no text, no watermark",
    toneHint: "expressif, clair",
    genre: "custom",
  },
  {
    id: "comic",
    label: "Comic",
    hint: "Graphic novel, encrage fort",
    prompt:
      "comic book illustration, bold ink outlines, dramatic shadows, limited palette, graphic novel panel energy, vertical 9:16, no text, no watermark",
    toneHint: "intense, rythmé",
    genre: "true_crime",
  },
  {
    id: "cinematic",
    label: "Ciné sombre",
    hint: "Docu / mystery cinématographique",
    prompt:
      "cinematic dark still, moody lighting, shallow depth of field, film grain, mysterious atmosphere, vertical 9:16, no text, no watermark",
    toneHint: "grave, mystérieux",
    genre: "true_crime",
  },
  {
    id: "clay3d",
    label: "Clay 3D",
    hint: "Rendu soft type short AI viral",
    prompt:
      "stylized clay 3D animation still, soft global illumination, rounded friendly forms, tactile clay texture, clean colorful set, vertical 9:16, no text, no watermark",
    toneHint: "enjoué, clair",
    genre: "kids",
  },
  {
    id: "flatvector",
    label: "Flat motion",
    hint: "Explainers / facts",
    prompt:
      "flat vector motion-graphics illustration, bold shapes, limited vibrant palette, clean geometric composition, vertical 9:16, no text, no watermark",
    toneHint: "posé, narratif",
    genre: "custom",
  },
  {
    id: "surreal",
    label: "Surréal",
    hint: "Collage curiosity-gap",
    prompt:
      "surreal collage illustration, unexpected juxtapositions, dreamlike lighting, high contrast, social-media hook frame, vertical 9:16, no text, no watermark",
    toneHint: "intrigant, rythmé",
    genre: "custom",
  },
  {
    id: "storybook",
    label: "Storybook",
    hint: "Pastel warm kids/wholesome",
    prompt:
      "soft pastel children's storybook illustration, rounded shapes, warm light, simple background, cute stylized characters, vertical 9:16, no text, no watermark",
    toneHint: "chaleureux, joyeux",
    genre: "kids",
  },
  {
    id: "noirphoto",
    label: "Polaroid grain",
    hint: "Cold case / found footage",
    prompt:
      "vintage polaroid photo aesthetic, harsh flash, desaturated colors, worn edges, cold-case documentary feel, vertical 9:16, no text, no watermark",
    toneHint: "posé, documentaire",
    genre: "true_crime",
  },
];

/** Instructs = tokens OmniVoice uniquement (comma + space). */
export const FACELESS_VOICES: FacelessVoice[] = [
  {
    id: "narrator_m",
    label: "Narrateur grave",
    hint: "Homme grave, lent — true crime",
    instruct: "male, very low pitch",
    speed: 0.88,
  },
  {
    id: "narrator_f",
    label: "Narratrice claire",
    hint: "Femme claire, news",
    instruct: "female, moderate pitch",
    speed: 1.0,
  },
  {
    id: "docu",
    label: "Docu posé",
    hint: "Homme neutre, documentaire",
    instruct: "male, moderate pitch",
    speed: 0.95,
  },
  {
    id: "intense",
    label: "Intense",
    hint: "Hooks énergiques, rapide",
    instruct: "male, high pitch",
    speed: 1.14,
  },
  {
    id: "whisper",
    label: "Chuchotement",
    hint: "Suspense ASMR-light",
    instruct: "male, whisper, low pitch",
    speed: 0.84,
  },
  {
    id: "young_f",
    label: "Jeune / kids",
    hint: "Femme jeune, enjouée",
    instruct: "female, young adult, high pitch",
    speed: 1.08,
  },
  {
    id: "story",
    label: "Conte",
    hint: "Storytime chaleureux",
    instruct: "female, moderate pitch",
    speed: 0.9,
  },
];

export const DEFAULT_FACELESS_LOOK_ID: FacelessLookId = "anime";
export const DEFAULT_FACELESS_VOICE_ID: FacelessVoiceId = "narrator_m";

export function getFacelessLook(
  id: string | undefined | null,
): FacelessLook {
  const found = FACELESS_LOOKS.find((l) => l.id === id);
  return (
    found ??
    FACELESS_LOOKS.find((l) => l.id === DEFAULT_FACELESS_LOOK_ID)!
  );
}

export function getFacelessVoice(
  id: string | undefined | null,
): FacelessVoice {
  const found = FACELESS_VOICES.find((v) => v.id === id);
  return (
    found ??
    FACELESS_VOICES.find((v) => v.id === DEFAULT_FACELESS_VOICE_ID)!
  );
}

export function matchFacelessLookId(
  visualStyle: string | undefined | null,
): FacelessLookId | null {
  if (!visualStyle?.trim()) return null;
  const v = visualStyle.toLowerCase();
  for (const look of FACELESS_LOOKS) {
    if (visualStyle.trim() === look.prompt) return look.id;
    if (v.includes(look.id)) return look.id;
  }
  if (v.includes("anime") || v.includes("manga")) return "anime";
  if (v.includes("comic") || v.includes("graphic novel")) return "comic";
  if (v.includes("clay") || v.includes("pixar") || v.includes("3d"))
    return "clay3d";
  if (v.includes("flat vector") || v.includes("motion-graphics"))
    return "flatvector";
  if (v.includes("surreal") || v.includes("collage")) return "surreal";
  if (v.includes("storybook") || v.includes("pastel")) return "storybook";
  if (v.includes("polaroid") || v.includes("cold-case")) return "noirphoto";
  if (v.includes("cinematic") || v.includes("etching") || v.includes("gravure"))
    return "cinematic";
  return null;
}

export function matchFacelessVoiceId(
  instructOrTone: string | undefined | null,
): FacelessVoiceId | null {
  if (!instructOrTone?.trim()) return null;
  const v = instructOrTone.toLowerCase();
  for (const voice of FACELESS_VOICES) {
    if (v === voice.instruct.toLowerCase()) return voice.id;
    if (v.includes(voice.id)) return voice.id;
  }
  if (v.includes("whisper")) return "whisper";
  if (v.includes("female") && (v.includes("young adult") || v.includes("high")))
    return "young_f";
  if (v.includes("female") && v.includes("warm")) return "story";
  if (v.includes("female")) return "narrator_f";
  if (v.includes("high pitch")) return "intense";
  if (
    v.includes("moderate pitch") ||
    v.includes("medium pitch") ||
    v.includes("medium-low")
  )
    return "docu";
  if (v.includes("very low pitch")) return "narrator_m";
  if (v.includes("male") || v.includes("low pitch")) return "narrator_m";
  return null;
}

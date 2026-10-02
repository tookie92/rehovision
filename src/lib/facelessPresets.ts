/**
 * Presets faceless : looks viraux DISTINCTS + voix OmniVoice.
 * Chaque look a un `negativePrompt` pour éviter le collapse vers Anime.
 */

export type FacelessLookId =
  | "anime"
  | "comic_us"
  | "photoreal"
  | "clay"
  | "flat"
  | "noir";

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
  /** Tokens à éviter — injectés dans le prompt Flux / negative SDXL */
  negativePrompt: string;
  toneHint: string;
  genre: "true_crime" | "kids" | "history" | "custom";
};

export type FacelessVoice = {
  id: FacelessVoiceId;
  label: string;
  hint: string;
  instruct: string;
  speed: number;
};

export type CastMember = {
  id: string;
  name: string;
  /** Description visuelle stable (visage, âge, cheveux, peau) */
  appearance: string;
  /** Tenue récurrente */
  clothing: string;
};

export const FACELESS_LOOKS: FacelessLook[] = [
  {
    id: "anime",
    label: "Anime",
    hint: "Manga cel-shading, yeux expressifs",
    prompt:
      "Japanese anime cel-shaded illustration, crisp clean lineart, large expressive anime eyes, flat cel colors, light screentone, 2D animation still",
    negativePrompt:
      "photorealistic, 3d render, clay, western comic, ben-day dots, documentary photo, oil painting",
    toneHint: "expressif, clair",
    genre: "custom",
  },
  {
    id: "comic_us",
    label: "Comic US",
    hint: "Pulp américain, Ben-Day — PAS manga",
    prompt:
      "American comic book pulp illustration, thick ink outlines, dramatic cross-hatching, Ben-Day dots, limited CMYK palette, Jack Kirby energy, western superhero comic panel",
    negativePrompt:
      "anime, manga, cel shading, big anime eyes, chibi, japanese animation, soft pastel storybook",
    toneHint: "intense, rythmé",
    genre: "true_crime",
  },
  {
    id: "photoreal",
    label: "Photo ciné",
    hint: "Still cinématographique réaliste",
    prompt:
      "cinematic photorealistic still frame, natural skin texture, anamorphic lens, shallow depth of field, film grain, grounded lighting, documentary drama",
    negativePrompt:
      "anime, manga, cartoon, comic book, illustration, clay, vector flat, drawing, painting",
    toneHint: "grave, mystérieux",
    genre: "true_crime",
  },
  {
    id: "clay",
    label: "Clay 3D",
    hint: "Claymation tactile stop-motion",
    prompt:
      "stop-motion claymation still, tactile polymer clay texture, visible fingerprints in clay, handmade miniature set, soft studio lighting, Aardman-like craft",
    negativePrompt:
      "anime, manga, 2d flat illustration, photoreal skin, vector art, comic ink",
    toneHint: "enjoué, clair",
    genre: "kids",
  },
  {
    id: "flat",
    label: "Flat vector",
    hint: "Motion graphics géométrique",
    prompt:
      "flat vector motion-graphics illustration, bold geometric shapes, limited saturated palette, no gradients, clean iconographic characters, explainer video style",
    negativePrompt:
      "anime eyes, manga, photorealistic, clay, detailed skin pores, comic crosshatching, painterly",
    toneHint: "posé, narratif",
    genre: "custom",
  },
  {
    id: "noir",
    label: "Polaroid noir",
    hint: "Found footage / cold case grain",
    prompt:
      "vintage instant polaroid photograph, harsh direct flash, heavy film grain, desaturated cold tones, worn white border, found-footage documentary aesthetic",
    negativePrompt:
      "anime, manga, colorful cartoon, clay, clean vector, comic book ink, fantasy illustration",
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
  const resolved = resolveLookId(id);
  return FACELESS_LOOKS.find((l) => l.id === resolved)!;
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

/** Alias legacy (anciens lookId en base). */
const LOOK_ALIASES: Record<string, FacelessLookId> = {
  comic: "comic_us",
  cinematic: "photoreal",
  clay3d: "clay",
  flatvector: "flat",
  surreal: "flat",
  storybook: "clay",
  noirphoto: "noir",
};

export function resolveLookId(
  id: string | undefined | null,
): FacelessLookId {
  if (!id) return DEFAULT_FACELESS_LOOK_ID;
  if (LOOK_ALIASES[id]) return LOOK_ALIASES[id]!;
  const found = FACELESS_LOOKS.find((l) => l.id === id);
  return found?.id ?? DEFAULT_FACELESS_LOOK_ID;
}

export function matchFacelessLookId(
  visualStyle: string | undefined | null,
): FacelessLookId | null {
  if (!visualStyle?.trim()) return null;
  const v = visualStyle.toLowerCase();
  for (const look of FACELESS_LOOKS) {
    if (visualStyle.trim() === look.prompt) return look.id;
    if (v.includes(look.id.replace("_", " "))) return look.id;
  }
  if (v.includes("anime") || v.includes("manga") || v.includes("cel"))
    return "anime";
  if (v.includes("ben-day") || v.includes("comic book") || v.includes("pulp"))
    return "comic_us";
  if (v.includes("photoreal") || v.includes("cinematic photo"))
    return "photoreal";
  if (v.includes("clay") || v.includes("aardman") || v.includes("stop-motion"))
    return "clay";
  if (v.includes("vector") || v.includes("motion-graphics")) return "flat";
  if (v.includes("polaroid") || v.includes("found-footage")) return "noir";
  if (v.includes("cinematic") || v.includes("etching")) return "photoreal";
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

/** Texte cast lock à coller dans chaque prompt image. */
export function formatCastLock(
  cast: CastMember[] | undefined | null,
): string | null {
  if (!cast || cast.length === 0) return null;
  const parts = cast.map((c) => {
    const bits = [c.name, c.appearance, c.clothing].filter(Boolean);
    return bits.join(", ");
  });
  return `SAME CHARACTERS every frame (identity lock): ${parts.join(" | ")}. Keep face, hair, age, skin tone and outfit consistent across scenes`;
}

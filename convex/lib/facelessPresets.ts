/**
 * Presets faceless : looks viraux DISTINCTS (refs Clay / Spider-Verse / Sketch / Photo).
 * Chaque look a un `negativePrompt` pour éviter le collapse entre familles.
 */

export type FacelessLookId =
  | "clay"
  | "spiderverse"
  | "sketch"
  | "photoreal"
  | "anime";

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
    id: "clay",
    label: "Clay",
    hint: "Stop-motion pâte à modeler, folk",
    prompt:
      "handcrafted stop-motion claymation still, polymer clay characters with fingerprints, large round doll eyes, soft matte clay skin, miniature ornate set, warm ochre terracotta palette, Aardman-like tactile craft, soft studio key light",
    negativePrompt:
      "photorealistic, anime, manga, flat vector, comic halftone, spider-verse, neon rim light, oil painting sketch, charcoal drawing",
    toneHint: "enjoué, clair",
    genre: "kids",
  },
  {
    id: "spiderverse",
    label: "Spider-Verse",
    hint: "3D comic, halftones, néon",
    prompt:
      "Spider-Verse stylized 3D comic still, bold ink outlines, visible CMYK halftone dots, chromatic aberration, neon rim lighting, high contrast noir-comic lighting, exaggerated proportions, graphic novel energy, not Japanese anime",
    negativePrompt:
      "anime, manga, cel shading, big anime eyes, claymation, photoreal skin pores, watercolor sketch, flat vector icons, polaroid photo",
    toneHint: "intense, rythmé",
    genre: "true_crime",
  },
  {
    id: "sketch",
    label: "Sketch",
    hint: "Encre + aquarelle dramatique",
    prompt:
      "expressive mixed-media courtroom sketch illustration, bold charcoal ink outlines, dramatic cross-hatching, watercolor washes in burnt orange and gold, dark moody background, gestural energetic strokes, editorial magazine art",
    negativePrompt:
      "photorealistic, clay, 3d render, anime, manga, spider-verse halftone, flat vector, clean corporate photo, plastic CGI",
    toneHint: "grave, mystérieux",
    genre: "true_crime",
  },
  {
    id: "photoreal",
    label: "Photo concept",
    hint: "Studio high-key, métaphore visuelle",
    prompt:
      "conceptual high-key studio photograph, sharp photoreal detail, vast white negative space, polished reflective floor, clean modern lighting, single powerful visual metaphor, fashion-editorial composition, vertical 9:16",
    negativePrompt:
      "anime, manga, cartoon, clay, comic book, sketch drawing, watercolor, halftone, neon rim light, cluttered background, grainy polaroid",
    toneHint: "posé, narratif",
    genre: "custom",
  },
  {
    id: "anime",
    label: "Anime",
    hint: "Cel-shading manga",
    prompt:
      "Japanese anime cel-shaded illustration, crisp clean lineart, large expressive anime eyes, flat cel colors, light screentone, 2D animation still",
    negativePrompt:
      "photorealistic, 3d render, clay, western comic, spider-verse, ben-day dots, charcoal sketch, oil painting",
    toneHint: "expressif, clair",
    genre: "custom",
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

export const DEFAULT_FACELESS_LOOK_ID: FacelessLookId = "clay";
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
  comic: "spiderverse",
  comic_us: "spiderverse",
  cinematic: "photoreal",
  clay3d: "clay",
  flat: "sketch",
  flatvector: "sketch",
  surreal: "sketch",
  storybook: "clay",
  noir: "sketch",
  noirphoto: "sketch",
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
  if (
    v.includes("spider-verse") ||
    v.includes("spiderverse") ||
    v.includes("halftone") ||
    v.includes("neon rim")
  )
    return "spiderverse";
  if (
    v.includes("clay") ||
    v.includes("aardman") ||
    v.includes("stop-motion") ||
    v.includes("polymer clay")
  )
    return "clay";
  if (
    v.includes("charcoal") ||
    v.includes("cross-hatching") ||
    v.includes("watercolor") ||
    v.includes("courtroom sketch") ||
    v.includes("mixed-media")
  )
    return "sketch";
  if (
    v.includes("high-key") ||
    v.includes("photoreal") ||
    v.includes("conceptual") ||
    v.includes("negative space")
  )
    return "photoreal";
  if (v.includes("anime") || v.includes("manga") || v.includes("cel"))
    return "anime";
  if (v.includes("ben-day") || v.includes("comic book") || v.includes("pulp"))
    return "spiderverse";
  if (v.includes("vector") || v.includes("motion-graphics")) return "sketch";
  if (v.includes("polaroid") || v.includes("found-footage")) return "sketch";
  if (v.includes("cinematic")) return "photoreal";
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

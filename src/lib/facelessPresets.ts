/**
 * Presets faceless : 4 looks d’imitation littérale des refs
 * (Photo concept / Spider-Verse / Clay / Polar noir).
 * Flux ignore le canal négatif → avoid: dans le prompt positif via imagePrompt.
 */

export type FacelessLookId =
  | "photoreal"
  | "spiderverse"
  | "clay"
  | "polar_noir";

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
  /** Tokens à éviter — injectés dans avoid: (Flux) / negative SDXL */
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
    id: "photoreal",
    label: "Photo concept",
    hint: "Studio high-key, métaphore visuelle",
    prompt:
      "exact conceptual fashion-editorial photograph, ultra-sharp photoreal DSLR 85mm, seamless pure white void background, polished reflective concrete floor, clinical studio light, real skin fabric metal textures, single visual metaphor",
    negativePrompt:
      "anime, manga, cel shading, cartoon, claymation, polymer clay, spider-verse, CMYK halftone, comic ink, charcoal sketch, watercolor, painted",
    toneHint: "posé, narratif",
    genre: "custom",
  },
  {
    id: "spiderverse",
    label: "Spider-Verse",
    hint: "Into the Spider-Verse : halftones + néon",
    prompt:
      "Into the Spider-Verse movie still, dense CMYK Ben-Day halftone dots, RGB chromatic aberration, bold black ink outlines, blue and magenta neon rim light, hand-drawn white scratch lines, comic-book CGI printed texture, stylized half-lidded comic eyes thick ink lids tight mouth line",
    negativePrompt:
      "anime, manga, cel shading, big anime eyes, smooth flat anime face, claymation, polymer clay, plasticine, doll eyes, photoreal photo, watercolor, soft global illumination",
    toneHint: "intense, rythmé",
    genre: "true_crime",
  },
  {
    id: "clay",
    label: "Clay",
    hint: "Pâte à modeler + yeux de poupée Aardman",
    prompt:
      "exact stop-motion claymation frame, polymer clay plasticine with fingerprints, oversized bulging white doll eyes tiny black pinpoint pupils, soft matte clay skin, Aardman Wallace-and-Gromit craft, miniature set, warm ochre terracotta",
    negativePrompt:
      "anime, manga, cel shading, photorealistic, DSLR, spider-verse, CMYK halftone, Ben-Day, neon rim, chromatic aberration, comic ink, sharp irises, smooth CGI skin",
    toneHint: "enjoué, clair",
    genre: "kids",
  },
  {
    id: "polar_noir",
    label: "Polar noir",
    hint: "Croquis tribunal encre + aquarelle",
    prompt:
      "exact courtroom sketch illustration, raw marker ink colored-pencil, bold charcoal cross-hatching scribbles, burnt orange gold light, deep midnight blue black background, gestural unfinished edges, polar noir editorial",
    negativePrompt:
      "anime, manga, cel shading, photorealistic, claymation, polymer clay, doll eyes, spider-verse, CMYK halftone, neon rim, 3d render, clean vector, bright sunny daylight",
    toneHint: "grave, mystérieux",
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

export const DEFAULT_FACELESS_LOOK_ID: FacelessLookId = "photoreal";
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
  sketch: "polar_noir",
  flat: "polar_noir",
  flatvector: "polar_noir",
  surreal: "polar_noir",
  storybook: "clay",
  noir: "polar_noir",
  noirphoto: "polar_noir",
  anime: "polar_noir",
  manga: "polar_noir",
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
    v.includes("into the spider") ||
    v.includes("ben-day") ||
    v.includes("halftone") ||
    v.includes("chromatic aberration")
  )
    return "spiderverse";
  if (
    v.includes("clay") ||
    v.includes("aardman") ||
    v.includes("stop-motion") ||
    v.includes("polymer clay") ||
    v.includes("plasticine") ||
    v.includes("doll eyes")
  )
    return "clay";
  if (
    v.includes("polar noir") ||
    v.includes("courtroom sketch") ||
    v.includes("cross-hatching") ||
    v.includes("charcoal") ||
    v.includes("colored-pencil") ||
    v.includes("burnt orange")
  )
    return "polar_noir";
  if (
    v.includes("high-key") ||
    v.includes("photoreal") ||
    v.includes("white void") ||
    v.includes("dslr") ||
    v.includes("conceptual fashion")
  )
    return "photoreal";
  if (v.includes("cinematic") || v.includes("editorial photograph"))
    return "photoreal";
  if (v.includes("anime") || v.includes("manga")) return "polar_noir";
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

/** Texte cast lock — compact (Flux truncate) mais identité stricte. */
export function formatCastLock(
  cast: CastMember[] | undefined | null,
): string | null {
  if (!cast || cast.length === 0) return null;
  const parts = cast.slice(0, 3).map((c) => {
    const bits = [
      c.name?.trim().slice(0, 30),
      c.appearance?.trim().slice(0, 60),
      c.clothing?.trim().slice(0, 40),
    ].filter(Boolean);
    return bits.join(", ");
  });
  return `SAME CAST every scene: ${parts.join(" | ")}`;
}

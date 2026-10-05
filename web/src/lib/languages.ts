/** Langues presets atelier + catalogue OmniVoice pour recherche. */
import OMNIVOICE_LANGS from "./omnivoice-langs.json";

export type LangOption = {
  code: string;
  label: string;
  /** hint UI : supporté OmniVoice / fragile / hors catalogue */
  support: "ok" | "fragile" | "off";
  region?: string;
  /**
   * Mode livre audio basé sur heures d’entraînement OmniVoice :
   * - cast = multi-voix design (FR, EN, ES, DE…)
   * - single = une voix auto / 1 clone pour tout le livre
   */
  audiobookMode?: "cast" | "single";
};

/**
 * Presets atelier — ordre UX :
 * 1) Cast multi-voix (high-resource OmniVoice)
 * 2) Narration 1 voix correcte (mid)
 * 3) Narration 1 voix fragile (low-resource africain)
 */
export const LANGUAGES: LangOption[] = [
  // --- Cast multi-voix (recommandé) ---
  {
    code: "fr",
    label: "Français",
    support: "ok",
    region: "Europe",
    audiobookMode: "cast",
  },
  {
    code: "en",
    label: "English",
    support: "ok",
    region: "International",
    audiobookMode: "cast",
  },
  {
    code: "es",
    label: "Español",
    support: "ok",
    region: "International",
    audiobookMode: "cast",
  },
  {
    code: "de",
    label: "Deutsch",
    support: "ok",
    region: "Europe",
    audiobookMode: "cast",
  },
  {
    code: "it",
    label: "Italiano",
    support: "ok",
    region: "Europe",
    audiobookMode: "cast",
  },
  {
    code: "pt",
    label: "Português",
    support: "ok",
    region: "International",
    audiobookMode: "cast",
  },
  // --- 1 voix (correct) ---
  {
    code: "ar",
    label: "العربية",
    support: "ok",
    region: "International",
    audiobookMode: "single",
  },
  {
    code: "sw",
    label: "Kiswahili",
    support: "ok",
    region: "Afrique de l’Est",
    audiobookMode: "single",
  },
  // --- 1 voix (fragile / low-resource) ---
  {
    code: "wo",
    label: "Wolof (Sénégal)",
    support: "fragile",
    region: "Afrique de l’Ouest",
    audiobookMode: "single",
  },
  {
    code: "wof",
    label: "Wolof (Gambie)",
    support: "fragile",
    region: "Afrique de l’Ouest",
    audiobookMode: "single",
  },
  {
    code: "yo",
    label: "Yorùbá",
    support: "fragile",
    region: "Afrique de l’Ouest",
    audiobookMode: "single",
  },
  {
    code: "ha",
    label: "Hausa",
    support: "fragile",
    region: "Afrique de l’Ouest",
    audiobookMode: "single",
  },
  {
    code: "sn",
    label: "chiShona (Shona)",
    support: "fragile",
    region: "Afrique australe",
    audiobookMode: "single",
  },
  {
    code: "ln",
    label: "Lingala",
    support: "fragile",
    region: "Afrique centrale",
    audiobookMode: "single",
  },
  {
    code: "nd",
    label: "isiNdebele (Ndebele)",
    support: "fragile",
    region: "Afrique australe",
    audiobookMode: "single",
  },
];

/** Chips rapides « cast multi-voix » dans le LangPicker TTS. */
export const CAST_LANG_CHIPS = ["fr", "en", "es", "de", "it", "pt"] as const;

/** Chips rapides « 1 voix » (africain + arabe). */
export const SINGLE_LANG_CHIPS = ["ar", "sw", "wo", "yo", "ha"] as const;

export type LangCode = string;

export const OMNIVOICE_LANG_MAP: Record<string, string> = {
  ...OMNIVOICE_LANGS,
  wo: "Wolof (Sénégal)",
  wof: "Wolof (Gambie)",
  ar: "العربية (arb)",
};

/** ISO atelier → code OmniVoice LANG_IDS (miroir worker/engines/voice.py). */
export const OMNI_LANG_ALIAS: Record<string, string> = {
  wof: "wo",
  ar: "arb",
  nd: "zu",
  nr: "zu",
  st: "zu",
  tn: "zu",
};

/**
 * High-resource OmniVoice (~milliers d’heures) — design / cast multi-voix OK.
 * Aligné sur docs OmniVoice (EN/ES/FR/DE/IT/PT…).
 */
export const CAST_FRIENDLY_LANGS = new Set([
  "fr", "en", "es", "de", "it", "pt",
  "nl", "pl", "ru", "uk", "sv", "da", "no", "fi", "cs", "ro", "hu", "el",
  "zh", "ja", "ko", "vi", "id", "tr", "ca", "gl", "eu",
]);

/** Low-resource : pas de design instruct (bruit) — 1 voix auto / clone. */
export const AFRICAN_TTS_NO_DESIGN = new Set([
  "wo", "wof", "sn", "sw", "ln", "yo", "ha", "bm", "ig", "ff", "am",
  "zu", "xh", "nd", "nr", "st", "tn", "rw", "so", "ny", "ar", "arb",
]);

export function resolveOmniVoiceLang(code: string): string {
  const c = normalizeLangCode(code);
  return OMNI_LANG_ALIAS[c] ?? c;
}

export function isOmniVoiceLang(code: string): boolean {
  const resolved = resolveOmniVoiceLang(code);
  return resolved in OMNIVOICE_LANGS;
}

export function normalizeLangCode(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  const byLabel = LANGUAGES.find((l) => l.label.toLowerCase() === t);
  if (byLabel) return byLabel.code;
  const paren = t.match(/\(([a-z]{2,8})\)\s*$/);
  if (paren) return paren[1];
  return t.split("-")[0] ?? "";
}

/** Mode UX livre audio pour la langue TTS. */
export function audiobookVoiceMode(
  targetLang: string,
): "cast" | "single" {
  const c = normalizeLangCode(targetLang);
  const preset = LANGUAGES.find((l) => l.code === c);
  if (preset?.audiobookMode) return preset.audiobookMode;
  const resolved = resolveOmniVoiceLang(c);
  if (CAST_FRIENDLY_LANGS.has(c) || CAST_FRIENDLY_LANGS.has(resolved)) {
    return "cast";
  }
  return "single";
}

export function allowPublicDesignVoice(targetLang: string): boolean {
  return audiobookVoiceMode(targetLang) === "cast";
}

export function prefersCloneForTts(targetLang: string): boolean {
  return audiobookVoiceMode(targetLang) === "single";
}

export function langSupport(code: string): LangOption["support"] {
  const c = normalizeLangCode(code);
  const preset = LANGUAGES.find((l) => l.code === c);
  if (preset) return preset.support;
  if (CAST_FRIENDLY_LANGS.has(c) || CAST_FRIENDLY_LANGS.has(resolveOmniVoiceLang(c))) {
    return "ok";
  }
  if (isOmniVoiceLang(c)) return "fragile";
  return "off";
}

export function langLabel(code: string): string {
  const c = normalizeLangCode(code);
  const preset = LANGUAGES.find((l) => l.code === c);
  if (preset) return preset.label;
  const name = OMNIVOICE_LANG_MAP[c];
  return name ? `${name} (${c})` : c;
}

export function languageSuggestions(
  query: string,
  limit = 40,
): LangOption[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const out: LangOption[] = [];

  for (const l of LANGUAGES) {
    if (
      !q ||
      l.code.includes(q) ||
      l.label.toLowerCase().includes(q) ||
      (l.region?.toLowerCase().includes(q) ?? false)
    ) {
      seen.add(l.code);
      out.push(l);
    }
  }

  for (const [code, label] of Object.entries(OMNIVOICE_LANGS)) {
    if (seen.has(code)) continue;
    if (!q || code.includes(q) || label.toLowerCase().includes(q)) {
      const mode = audiobookVoiceMode(code);
      out.push({
        code,
        label: `${label} (${code})`,
        support: mode === "cast" ? "ok" : "fragile",
        audiobookMode: mode,
      });
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

export function supportHint(support: LangOption["support"]): string {
  if (support === "ok") return "Bonne qualité OmniVoice";
  if (support === "fragile") return "Qualité variable — 1 voix recommandée";
  return "Code non listé OmniVoice";
}

/** Badge court pour la barre d’outils livre audio. */
export function audiobookModeBadge(targetLang: string): string {
  return audiobookVoiceMode(targetLang) === "cast"
    ? "Cast multi-voix"
    : "1 voix";
}

export function voicePolicyHint(targetLang: string): string | null {
  const mode = audiobookVoiceMode(targetLang);
  const label = langLabel(targetLang);
  if (mode === "cast") {
    return `Cast multi-voix disponible pour ${label} (Amina, Omar…). Choisis une voix par personnage.`;
  }
  return `${label} : une seule voix pour tout le livre (Auto). Optionnel : 1 échantillon vocal pour personnaliser — pas besoin de 3 clones.`;
}

/** Miroir worker/engines/translate.py — langues NLLB FLORES supportées. */
export const NLLB_FLORES_ISO = new Set([
  "fr", "en", "es", "pt", "de", "it", "ar", "zh", "ja", "ko", "hi",
  "sw", "ln", "yo", "ha", "wo", "wof", "sn", "nd", "nr", "bm", "ig",
  "zu", "xh", "st", "tn", "ny", "rw", "so", "am",
]);

/** Traduction auto NLLB disponible pour cette paire. */
export function canAutoTranslate(source: string, target: string): boolean {
  const s = normalizeLangCode(source);
  const t = normalizeLangCode(target);
  if (!s || !t) return false;
  if (s === t) return true;
  return NLLB_FLORES_ISO.has(s) && NLLB_FLORES_ISO.has(t);
}

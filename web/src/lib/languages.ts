/** Langues presets atelier + catalogue OmniVoice pour recherche. */
import OMNIVOICE_LANGS from "./omnivoice-langs.json";

export type LangOption = {
  code: string;
  label: string;
  /** hint UI : supporté OmniVoice / fragile / hors catalogue */
  support: "ok" | "fragile" | "off";
  region?: string;
};

/** Presets créateurs — Wolof Sénégal + Gambie explicites. */
export const LANGUAGES: LangOption[] = [
  { code: "fr", label: "Français", support: "ok", region: "Europe" },
  { code: "en", label: "English", support: "ok", region: "International" },
  { code: "wo", label: "Wolof (Sénégal)", support: "ok", region: "Afrique de l’Ouest" },
  { code: "wof", label: "Wolof (Gambie)", support: "ok", region: "Afrique de l’Ouest" },
  { code: "sn", label: "chiShona (Shona)", support: "ok", region: "Afrique australe" },
  {
    code: "nd",
    label: "isiNdebele (Ndebele)",
    support: "fragile",
    region: "Afrique australe",
  },
  { code: "sw", label: "Kiswahili", support: "ok", region: "Afrique de l’Est" },
  { code: "ln", label: "Lingala", support: "ok", region: "Afrique centrale" },
  { code: "yo", label: "Yorùbá", support: "ok", region: "Afrique de l’Ouest" },
  { code: "ha", label: "Hausa", support: "ok", region: "Afrique de l’Ouest" },
  { code: "ar", label: "العربية", support: "ok", region: "International" },
  { code: "pt", label: "Português", support: "ok", region: "International" },
];

export type LangCode = string;

export const OMNIVOICE_LANG_MAP: Record<string, string> = {
  ...OMNIVOICE_LANGS,
  // Labels plus clairs pour les deux Wolof
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

export function resolveOmniVoiceLang(code: string): string {
  const c = normalizeLangCode(code);
  return OMNI_LANG_ALIAS[c] ?? c;
}

export function isOmniVoiceLang(code: string): boolean {
  const resolved = resolveOmniVoiceLang(code);
  return resolved in OMNIVOICE_LANGS;
}

export function langSupport(code: string): LangOption["support"] {
  const c = normalizeLangCode(code);
  const preset = LANGUAGES.find((l) => l.code === c);
  if (preset) return preset.support;
  if (isOmniVoiceLang(c)) return "ok";
  return "off";
}

export function langLabel(code: string): string {
  const c = normalizeLangCode(code);
  const preset = LANGUAGES.find((l) => l.code === c);
  if (preset) return preset.label;
  const name = OMNIVOICE_LANG_MAP[c];
  return name ? `${name} (${c})` : c;
}

export function normalizeLangCode(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  // "Wolof (Sénégal)" → try match preset by label first
  const byLabel = LANGUAGES.find((l) => l.label.toLowerCase() === t);
  if (byLabel) return byLabel.code;
  const paren = t.match(/\(([a-z]{2,8})\)\s*$/);
  if (paren) return paren[1];
  return t.split("-")[0] ?? "";
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
      out.push({
        code,
        label: `${label} (${code})`,
        support: "ok",
      });
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

export function supportHint(support: LangOption["support"]): string {
  if (support === "ok") return "Supporté OmniVoice";
  if (support === "fragile") return "Hors catalogue TTS — qualité variable";
  return "Code non listé OmniVoice";
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

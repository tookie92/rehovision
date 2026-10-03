/** Langues Couche 1. TTS réel FR (Piper) ; autres via stub jusqu’à OmniVoice. */
export const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
  { code: "ln", label: "Lingala" },
  { code: "yo", label: "Yorùbá" },
  { code: "ha", label: "Hausa" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

/** Presets de rendu partagés UI ↔ Convex. */

export const CAPTION_STYLES = [
  {
    id: "viral",
    label: "Viral",
    hint: "Blanc + karaoke cyan",
  },
  {
    id: "bold_green",
    label: "Bold green",
    hint: "Vert pop type shorts",
  },
  {
    id: "yellow_pop",
    label: "Yellow pop",
    hint: "Jaune outline noir",
  },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Plus petit, bas d’écran",
  },
] as const;

export const LAYOUT_MODES = [
  {
    id: "smart",
    label: "Smart",
    hint: "Suit le visage",
  },
  {
    id: "fill",
    label: "Fill",
    hint: "Crop plein cadre centré",
  },
  {
    id: "fit",
    label: "Fit",
    hint: "Letterbox, tout visible",
  },
  {
    id: "split",
    label: "Split",
    hint: "2 visages empilés",
  },
] as const;

export const VOICEOVER_MODES = [
  {
    id: "off",
    label: "Off",
    hint: "Audio source seul",
  },
  {
    id: "mix",
    label: "Mix",
    hint: "TTS sous la voix originale",
  },
  {
    id: "replace",
    label: "Replace",
    hint: "TTS remplace l’audio",
  },
] as const;

export const AUDIO_ENHANCE_MODES = [
  {
    id: "off",
    label: "Off",
    hint: "Audio brut de la source",
  },
  {
    id: "light",
    label: "Light",
    hint: "Denoise léger + loudnorm (−16 LUFS)",
  },
] as const;

export type CaptionStyleId = (typeof CAPTION_STYLES)[number]["id"];
export type LayoutModeId = (typeof LAYOUT_MODES)[number]["id"];
export type VoiceoverModeId = (typeof VOICEOVER_MODES)[number]["id"];
export type AudioEnhanceId = (typeof AUDIO_ENHANCE_MODES)[number]["id"];

export function isCaptionStyle(v: string): v is CaptionStyleId {
  return CAPTION_STYLES.some((s) => s.id === v);
}

export function isLayoutMode(v: string): v is LayoutModeId {
  return LAYOUT_MODES.some((s) => s.id === v);
}

export function isVoiceoverMode(v: string): v is VoiceoverModeId {
  return VOICEOVER_MODES.some((s) => s.id === v);
}

export function isAudioEnhance(v: string): v is AudioEnhanceId {
  return AUDIO_ENHANCE_MODES.some((s) => s.id === v);
}

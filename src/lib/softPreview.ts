/** Soft preview navigateur — approx. des looks/captions CapCut-like (pas un rendu ffmpeg). */

import type {
  CaptionStyleId,
  LookFilterId,
  LogoCornerId,
} from "@/lib/renderPresets";

export function softLookCssFilter(look: LookFilterId): string {
  switch (look) {
    case "warm":
      return "saturate(1.25) contrast(1.08) sepia(0.35) brightness(1.04)";
    case "cool":
      return "saturate(1.1) contrast(1.08) hue-rotate(18deg) brightness(1.03)";
    case "contrast":
      return "contrast(1.35) saturate(1.15) brightness(1.03)";
    case "soft_grain":
      return "contrast(1.08) saturate(0.92) brightness(1.02)";
    case "lut":
      // Soft approx — le .cube réel = re-rendu ffmpeg
      return "contrast(1.14) saturate(1.22) sepia(0.15)";
    default:
      return "none";
  }
}

export function softLookNeedsRealRender(look: LookFilterId): boolean {
  return look === "lut";
}

export type SoftCaptionStyle = {
  color: string;
  highlight: string;
  stroke: string;
  strokeWidth: string;
  sizeClass: string;
  weight: string;
  uppercase: boolean;
  tracking: string;
};

export function softCaptionStyle(
  style: CaptionStyleId,
): SoftCaptionStyle | null {
  if (style === "off") return null;
  switch (style) {
    case "bold_green":
      return {
        color: "#39ff7a",
        highlight: "#ffffff",
        stroke: "#000",
        strokeWidth: "4px",
        sizeClass: "text-xl md:text-2xl",
        weight: "font-black",
        uppercase: true,
        tracking: "tracking-wide",
      };
    case "yellow_pop":
      return {
        color: "#ffe566",
        highlight: "#ffffff",
        stroke: "#000",
        strokeWidth: "4px",
        sizeClass: "text-xl md:text-2xl",
        weight: "font-black",
        uppercase: true,
        tracking: "tracking-wide",
      };
    case "minimal":
      return {
        color: "#fff",
        highlight: "#ffe566",
        stroke: "transparent",
        strokeWidth: "0px",
        sizeClass: "text-base md:text-lg",
        weight: "font-semibold",
        uppercase: false,
        tracking: "tracking-normal",
      };
    case "neon_pink":
      return {
        color: "#ff4fd8",
        highlight: "#ffffff",
        stroke: "#1a0014",
        strokeWidth: "4px",
        sizeClass: "text-xl md:text-2xl",
        weight: "font-black",
        uppercase: true,
        tracking: "tracking-wide",
      };
    case "impact":
      return {
        color: "#fff",
        highlight: "#ffe566",
        stroke: "#000",
        strokeWidth: "5px",
        sizeClass: "text-2xl md:text-3xl",
        weight: "font-black",
        uppercase: true,
        tracking: "tracking-wider",
      };
    case "viral":
    default:
      return {
        color: "#fff",
        highlight: "#ffe566",
        stroke: "#000",
        strokeWidth: "4px",
        sizeClass: "text-xl md:text-2xl",
        weight: "font-black",
        uppercase: true,
        tracking: "tracking-wide",
      };
  }
}

export function logoCornerClass(corner: LogoCornerId): string {
  switch (corner) {
    case "tl":
      return "left-3 top-3";
    case "tr":
      return "right-3 top-3";
    case "bl":
      return "bottom-16 left-3";
    case "br":
    default:
      return "bottom-16 right-3";
  }
}

export function punchScale(effect: string): number {
  return effect === "zoom" ? 1.08 : 1;
}

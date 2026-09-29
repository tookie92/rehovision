/** Soft preview navigateur — approx. des looks/captions (pas un rendu ffmpeg). */

import type {
  CaptionStyleId,
  LookFilterId,
  LogoCornerId,
} from "@/lib/renderPresets";

export function softLookCssFilter(look: LookFilterId): string {
  switch (look) {
    case "warm":
      return "saturate(1.12) contrast(1.05) sepia(0.18) brightness(1.02)";
    case "cool":
      return "saturate(1.05) contrast(1.04) hue-rotate(12deg) brightness(1.01)";
    case "contrast":
      return "contrast(1.22) saturate(1.08) brightness(1.02)";
    case "soft_grain":
      return "contrast(1.04) saturate(0.96) brightness(1.01)";
    case "lut":
      // LUT .cube non approximable en CSS
      return "none";
    default:
      return "none";
  }
}

export function softLookNeedsRealRender(look: LookFilterId): boolean {
  return look === "lut";
}

export type SoftCaptionStyle = {
  color: string;
  stroke: string;
  sizeClass: string;
  weight: string;
};

export function softCaptionStyle(style: CaptionStyleId): SoftCaptionStyle {
  switch (style) {
    case "bold_green":
      return {
        color: "#39ff7a",
        stroke: "#000",
        sizeClass: "text-lg md:text-xl",
        weight: "font-bold",
      };
    case "yellow_pop":
      return {
        color: "#ffe566",
        stroke: "#000",
        sizeClass: "text-lg md:text-xl",
        weight: "font-extrabold",
      };
    case "minimal":
      return {
        color: "#fff",
        stroke: "transparent",
        sizeClass: "text-sm md:text-base",
        weight: "font-medium",
      };
    case "neon_pink":
      return {
        color: "#ff4fd8",
        stroke: "#1a0014",
        sizeClass: "text-lg md:text-xl",
        weight: "font-bold",
      };
    case "impact":
      return {
        color: "#fff",
        stroke: "#000",
        sizeClass: "text-xl md:text-2xl",
        weight: "font-black",
      };
    case "viral":
    default:
      return {
        color: "#fff",
        stroke: "#000",
        sizeClass: "text-lg md:text-xl",
        weight: "font-bold",
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
  return effect === "zoom" ? 1.06 : 1;
}

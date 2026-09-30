/**
 * LUT .cube exportables (taille 17) — approx. des looks Warm / Cool / Contrast.
 * Soft grain n’est pas une LUT pure (bruit temporel) → pas d’export .cube.
 */

export type ExportableLookId = "warm" | "cool" | "contrast";

/** Packs préchargés (Étape 6 optionnel) — appliqués via lookFilter=lut + .cube. */
export type LutPackId = "cinema_warm" | "teal_cool" | "noir_punch";

export const LUT_PACKS: ReadonlyArray<{
  id: LutPackId;
  label: string;
  hint: string;
  look: ExportableLookId;
  title: string;
}> = [
  {
    id: "cinema_warm",
    label: "Cinéma warm",
    hint: "Ambre soft, peaux chaudes",
    look: "warm",
    title: "Rehovision Cinéma Warm",
  },
  {
    id: "teal_cool",
    label: "Teal cool",
    hint: "Bleus froids, contrast léger",
    look: "cool",
    title: "Rehovision Teal Cool",
  },
  {
    id: "noir_punch",
    label: "Noir punch",
    hint: "Contraste net, shorts dark",
    look: "contrast",
    title: "Rehovision Noir Punch",
  },
];

const SIZE = 17;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function mapWarm(r: number, g: number, b: number): [number, number, number] {
  return [
    clamp01(r * 1.06 + 0.02),
    clamp01(g * 1.02),
    clamp01(b * 0.92),
  ];
}

function mapCool(r: number, g: number, b: number): [number, number, number] {
  return [
    clamp01(r * 0.92),
    clamp01(g * 1.0),
    clamp01(b * 1.08 + 0.01),
  ];
}

function mapContrast(r: number, g: number, b: number): [number, number, number] {
  const c = 1.18;
  const mid = 0.5;
  return [
    clamp01((r - mid) * c + mid + 0.02),
    clamp01((g - mid) * c + mid + 0.02),
    clamp01((b - mid) * c + mid + 0.02),
  ];
}

const MAPPERS: Record<
  ExportableLookId,
  (r: number, g: number, b: number) => [number, number, number]
> = {
  warm: mapWarm,
  cool: mapCool,
  contrast: mapContrast,
};

/** Contenu texte d’un fichier .cube compatible DaVinci / ffmpeg lut3d. */
export function buildCubeLut(
  look: ExportableLookId,
  title = `Rehovision ${look}`,
): string {
  const map = MAPPERS[look];
  const lines: string[] = [
    `TITLE "${title}"`,
    `# Rehovision look export — approximate grade`,
    `LUT_3D_SIZE ${SIZE}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];
  for (let b = 0; b < SIZE; b++) {
    for (let g = 0; g < SIZE; g++) {
      for (let r = 0; r < SIZE; r++) {
        const rin = r / (SIZE - 1);
        const gin = g / (SIZE - 1);
        const bin = b / (SIZE - 1);
        const [rout, gout, bout] = map(rin, gin, bin);
        lines.push(
          `${rout.toFixed(6)} ${gout.toFixed(6)} ${bout.toFixed(6)}`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

export function isExportableLook(id: string): id is ExportableLookId {
  return id === "warm" || id === "cool" || id === "contrast";
}

export function buildLutPackCube(packId: LutPackId): string {
  const pack = LUT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Pack LUT inconnu");
  return buildCubeLut(pack.look, pack.title);
}

/** Déclenche le téléchargement navigateur d’une LUT .cube. */
export function downloadCubeFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".cube") ? filename : `${filename}.cube`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

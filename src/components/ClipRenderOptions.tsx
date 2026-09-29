"use client";

import { useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  buildCubeLut,
  downloadCubeFile,
  isExportableLook,
} from "@/lib/lutCubes";
import {
  AUDIO_ENHANCE_MODES,
  CAPTION_STYLES,
  LAYOUT_MODES,
  LOOK_FILTERS,
  LOGO_CORNERS,
  PUNCH_EFFECTS,
  VOICEOVER_MODES,
  type AudioEnhanceId,
  type CaptionStyleId,
  type LayoutModeId,
  type LookFilterId,
  type LogoCornerId,
  type PunchEffectId,
  type VoiceoverModeId,
} from "@/lib/renderPresets";

type Props = {
  captionStyle: CaptionStyleId;
  layoutMode: LayoutModeId;
  voiceoverMode: VoiceoverModeId;
  audioEnhance: AudioEnhanceId;
  punchEffect: PunchEffectId;
  lookFilter: LookFilterId;
  lutUrl?: string | null;
  logoUrl?: string | null;
  logoCorner: LogoCornerId;
  logoOpacity: number;
  musicUrl?: string | null;
  musicVolume: number;
  disabled?: boolean;
  applyDisabled?: boolean;
  saving?: boolean;
  defaultOpen?: boolean;
  /** Masque le CTA interne si un bouton parent gère le re-rendu. */
  hideApply?: boolean;
  /** drawer = panneau latéral toujours ouvert (workspace) */
  variant?: "default" | "drawer";
  splitSwap?: boolean;
  onSplitSwap?: (v: boolean) => void;
  onOpenSplitFrame?: () => void;
  onClearSplitFocus?: () => void;
  hasManualSplitFocus?: boolean;
  onCaptionStyle: (v: CaptionStyleId) => void;
  onLayoutMode: (v: LayoutModeId) => void;
  onVoiceoverMode: (v: VoiceoverModeId) => void;
  onAudioEnhance: (v: AudioEnhanceId) => void;
  onPunchEffect: (v: PunchEffectId) => void;
  onLookFilter: (v: LookFilterId) => void;
  onLogoCorner: (v: LogoCornerId) => void;
  onLogoOpacity: (v: number) => void;
  onMusicVolume: (v: number) => void;
  onUploadLogo: (file: File) => Promise<void>;
  onClearLogo: () => void;
  onUploadMusic: (file: File) => Promise<void>;
  onClearMusic: () => void;
  onUploadLut: (file: File) => Promise<void>;
  onClearLut: () => void;
  onApplyRerender: () => void;
  /** Force le stage en mode soft preview (live look / captions). */
  onPreviewIntent?: () => void;
};

function ChipGroup<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; hint: string }>;
  value: T;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              title={opt.hint}
              onClick={() => onChange(opt.id)}
              className={
                active
                  ? "cursor-pointer rounded-lg bg-signal/15 px-3 py-1.5 text-sm font-medium text-signal ring-1 ring-signal/40"
                  : "cursor-pointer rounded-lg bg-secondary/80 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pack viral / rendu — soft preview live au clic des chips.
 */
export function ClipRenderOptions({
  captionStyle,
  layoutMode,
  voiceoverMode,
  audioEnhance,
  punchEffect,
  lookFilter,
  lutUrl,
  logoUrl,
  logoCorner,
  logoOpacity,
  musicUrl,
  musicVolume,
  disabled,
  applyDisabled,
  saving,
  defaultOpen = false,
  hideApply = false,
  variant = "default",
  splitSwap = false,
  onSplitSwap,
  onOpenSplitFrame,
  onClearSplitFocus,
  hasManualSplitFocus = false,
  onCaptionStyle,
  onLayoutMode,
  onVoiceoverMode,
  onAudioEnhance,
  onPunchEffect,
  onLookFilter,
  onLogoCorner,
  onLogoOpacity,
  onMusicVolume,
  onUploadLogo,
  onClearLogo,
  onUploadMusic,
  onClearMusic,
  onUploadLut,
  onClearLut,
  onApplyRerender,
  onPreviewIntent,
}: Props) {
  const logoRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const lutRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen || variant === "drawer");
  const [assetBusy, setAssetBusy] = useState(false);
  const [lutHint, setLutHint] = useState<string | null>(null);
  const isDrawer = variant === "drawer";

  function withPreview<T>(fn: (v: T) => void): (v: T) => void {
    return (v) => {
      onPreviewIntent?.();
      fn(v);
    };
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    onPreviewIntent?.();
    setAssetBusy(true);
    try {
      await onUploadLogo(file);
    } finally {
      setAssetBusy(false);
    }
  }

  async function handleMusic(file: File | undefined) {
    if (!file) return;
    setAssetBusy(true);
    try {
      await onUploadMusic(file);
    } finally {
      setAssetBusy(false);
    }
  }

  async function handleLut(file: File | undefined) {
    if (!file) return;
    onPreviewIntent?.();
    setAssetBusy(true);
    try {
      await onUploadLut(file);
    } finally {
      setAssetBusy(false);
    }
  }

  async function exportLut() {
    setLutHint(null);
    try {
      if (lutUrl) {
        const res = await fetch(lutUrl);
        if (!res.ok) throw new Error(`Export LUT (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rehovision-custom.cube";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      }
      if (isExportableLook(lookFilter)) {
        downloadCubeFile(
          `rehovision-${lookFilter}.cube`,
          buildCubeLut(lookFilter),
        );
        return;
      }
      setLutHint(
        "Choisis Warm / Cool / Contrast, ou importe une .cube",
      );
    } catch (err) {
      setLutHint(err instanceof Error ? err.message : "Export LUT échoué");
    }
  }

  const body = (
        <div className={isDrawer ? "space-y-5 p-3" : "space-y-6 border-t border-border px-4 py-5"}>
          <ChipGroup
            label="Sous-titres"
            options={CAPTION_STYLES}
            value={captionStyle}
            disabled={disabled}
            onChange={withPreview(onCaptionStyle)}
          />
          <ChipGroup
            label="Cadre"
            options={LAYOUT_MODES}
            value={layoutMode}
            disabled={disabled}
            onChange={withPreview(onLayoutMode)}
          />
          {layoutMode === "split" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Split — visages</p>
              {onOpenSplitFrame && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onPreviewIntent?.();
                    onOpenSplitFrame();
                  }}
                  className="w-full cursor-pointer rounded-lg bg-signal/15 px-3 py-2.5 text-sm font-semibold text-signal ring-1 ring-signal/40 hover:bg-signal/25 disabled:opacity-50"
                >
                  Cadrer les visages…
                </button>
              )}
              {onSplitSwap && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onPreviewIntent?.();
                    onSplitSwap(!splitSwap);
                  }}
                  className="w-full cursor-pointer rounded-lg bg-secondary/80 px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  {splitSwap
                    ? "Échanger haut ↔ bas (actif)"
                    : "Échanger haut ↔ bas"}
                </button>
              )}
              {onClearSplitFocus && (
                <button
                  type="button"
                  disabled={disabled || !hasManualSplitFocus}
                  onClick={() => {
                    onPreviewIntent?.();
                    onClearSplitFocus();
                  }}
                  className="w-full cursor-pointer rounded-lg bg-secondary/80 px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  Reset auto (faces IA)
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Dialog landscape pour placer Haut & Bas. Re-rendre pour
                l’export.
              </p>
            </div>
          )}
          <ChipGroup
            label="Audio"
            options={AUDIO_ENHANCE_MODES}
            value={audioEnhance}
            disabled={disabled}
            onChange={withPreview(onAudioEnhance)}
          />
          <ChipGroup
            label="Effet punch"
            options={PUNCH_EFFECTS}
            value={punchEffect}
            disabled={disabled}
            onChange={withPreview(onPunchEffect)}
          />
          <ChipGroup
            label="Look"
            options={LOOK_FILTERS}
            value={lookFilter}
            disabled={disabled}
            onChange={withPreview(onLookFilter)}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">LUT (.cube)</p>
            <p className="text-xs text-muted-foreground">
              Soft = approx. ; vrai grade .cube au Re-rendre. Exporte aussi Warm
              / Cool / Contrast.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={lutRef}
                type="file"
                accept=".cube,application/octet-stream,text/plain"
                className="hidden"
                onChange={(e) => void handleLut(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || assetBusy}
                onClick={() => lutRef.current?.click()}
                className="cursor-pointer"
              >
                {lutUrl ? "Changer la LUT" : "Importer .cube"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  disabled ||
                  assetBusy ||
                  (!lutUrl && !isExportableLook(lookFilter))
                }
                onClick={() => void exportLut()}
                className="cursor-pointer"
              >
                Exporter .cube
              </Button>
              {lutUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || assetBusy}
                  onClick={onClearLut}
                  className="cursor-pointer"
                >
                  Retirer
                </Button>
              )}
            </div>
            {lutHint && (
              <p className="text-xs text-destructive" role="alert">
                {lutHint}
              </p>
            )}
            {lutUrl && (
              <p className="text-xs text-signal">
                LUT active — soft approx. ; Re-rendre pour le vrai .cube
              </p>
            )}
          </div>
          <ChipGroup
            label="Voiceover"
            options={VOICEOVER_MODES}
            value={voiceoverMode}
            disabled={disabled}
            onChange={withPreview(onVoiceoverMode)}
          />

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Logo</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={logoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleLogo(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || assetBusy}
                onClick={() => logoRef.current?.click()}
                className="cursor-pointer"
              >
                {logoUrl ? "Changer" : "Ajouter un logo"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || assetBusy}
                  onClick={onClearLogo}
                  className="cursor-pointer"
                >
                  Retirer
                </Button>
              )}
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-8 w-8 rounded object-contain"
                />
              )}
            </div>
            {logoUrl && (
              <>
                <ChipGroup
                  label="Position"
                  options={LOGO_CORNERS}
                  value={logoCorner}
                  disabled={disabled}
                  onChange={withPreview(onLogoCorner)}
                />
                <label className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="w-24 shrink-0">
                    Opacité {Math.round(logoOpacity * 100)}%
                  </span>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={Math.round(logoOpacity * 100)}
                    disabled={disabled}
                    onChange={(e) => {
                      onPreviewIntent?.();
                      onLogoOpacity(Number(e.target.value) / 100);
                    }}
                    className="flex-1 accent-[var(--signal)]"
                  />
                </label>
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium">Musique de fond</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={musicRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/*"
                className="hidden"
                onChange={(e) => void handleMusic(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || assetBusy}
                onClick={() => musicRef.current?.click()}
                className="cursor-pointer"
              >
                {musicUrl ? "Changer" : "Ajouter un MP3"}
              </Button>
              {musicUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || assetBusy}
                  onClick={onClearMusic}
                  className="cursor-pointer"
                >
                  Retirer
                </Button>
              )}
              {musicUrl && (
                <span className="text-xs text-signal">Prêt (ducking auto)</span>
              )}
            </div>
            {musicUrl && (
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="w-24 shrink-0">
                  Volume {Math.round(musicVolume * 100)}%
                </span>
                <input
                  type="range"
                  min={5}
                  max={40}
                  value={Math.round(musicVolume * 100)}
                  disabled={disabled}
                  onChange={(e) =>
                    onMusicVolume(Number(e.target.value) / 100)
                  }
                  className="flex-1 accent-[var(--signal)]"
                />
              </label>
            )}
          </div>

          {!hideApply && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                type="button"
                disabled={applyDisabled || saving}
                onClick={onApplyRerender}
                className="cursor-pointer"
              >
                {saving ? "Re-rendu en cours…" : "Appliquer sur tous les clips"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Régénère les exports 9:16 avec ces réglages.
              </p>
            </div>
          )}
          {hideApply && !isDrawer && (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Utilise le bouton « Re-rendre » pour mettre les clips en file.
            </p>
          )}
        </div>
  );

  if (isDrawer) {
    return (
      <div className="flex h-full flex-col overflow-hidden border-l border-border bg-card/40">
        <div className="shrink-0 border-b border-border px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Outils
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-secondary/40"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">
            Personnaliser le rendu
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Clique un look / captions → aperçu soft live sur le stage
          </p>
        </div>
        <CaretDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          weight="bold"
        />
      </button>

      {open && body}
    </div>
  );
}

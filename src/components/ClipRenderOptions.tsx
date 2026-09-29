"use client";

import { useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  AUDIO_ENHANCE_MODES,
  CAPTION_STYLES,
  LAYOUT_MODES,
  LOGO_CORNERS,
  PUNCH_EFFECTS,
  VOICEOVER_MODES,
  type AudioEnhanceId,
  type CaptionStyleId,
  type LayoutModeId,
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
  onCaptionStyle: (v: CaptionStyleId) => void;
  onLayoutMode: (v: LayoutModeId) => void;
  onVoiceoverMode: (v: VoiceoverModeId) => void;
  onAudioEnhance: (v: AudioEnhanceId) => void;
  onPunchEffect: (v: PunchEffectId) => void;
  onLogoCorner: (v: LogoCornerId) => void;
  onLogoOpacity: (v: number) => void;
  onMusicVolume: (v: number) => void;
  onUploadLogo: (file: File) => Promise<void>;
  onClearLogo: () => void;
  onUploadMusic: (file: File) => Promise<void>;
  onClearMusic: () => void;
  onApplyRerender: () => void;
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
 * Pack viral / rendu — replié par défaut pour garder les clips au centre.
 */
export function ClipRenderOptions({
  captionStyle,
  layoutMode,
  voiceoverMode,
  audioEnhance,
  punchEffect,
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
  onCaptionStyle,
  onLayoutMode,
  onVoiceoverMode,
  onAudioEnhance,
  onPunchEffect,
  onLogoCorner,
  onLogoOpacity,
  onMusicVolume,
  onUploadLogo,
  onClearLogo,
  onUploadMusic,
  onClearMusic,
  onApplyRerender,
}: Props) {
  const logoRef = useRef<HTMLInputElement>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [assetBusy, setAssetBusy] = useState(false);

  async function handleLogo(file: File | undefined) {
    if (!file) return;
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
            Captions, cadre, audio, logo, musique
          </p>
        </div>
        <CaretDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          weight="bold"
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-border px-4 py-5">
          <ChipGroup
            label="Sous-titres"
            options={CAPTION_STYLES}
            value={captionStyle}
            disabled={disabled}
            onChange={onCaptionStyle}
          />
          <ChipGroup
            label="Cadre"
            options={LAYOUT_MODES}
            value={layoutMode}
            disabled={disabled}
            onChange={onLayoutMode}
          />
          <ChipGroup
            label="Audio"
            options={AUDIO_ENHANCE_MODES}
            value={audioEnhance}
            disabled={disabled}
            onChange={onAudioEnhance}
          />
          <ChipGroup
            label="Effet punch"
            options={PUNCH_EFFECTS}
            value={punchEffect}
            disabled={disabled}
            onChange={onPunchEffect}
          />
          <ChipGroup
            label="Voiceover"
            options={VOICEOVER_MODES}
            value={voiceoverMode}
            disabled={disabled}
            onChange={onVoiceoverMode}
          />

          <div className="space-y-3 border-t border-border pt-5">
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
                  onChange={onLogoCorner}
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
                    onChange={(e) =>
                      onLogoOpacity(Number(e.target.value) / 100)
                    }
                    className="flex-1 accent-[var(--signal)]"
                  />
                </label>
              </>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-5">
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
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
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
          {hideApply && (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Utilise le bouton « Re-rendre » au-dessus pour mettre les clips en
              file.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

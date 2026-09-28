"use client";

import { Button } from "@/components/ui/button";
import {
  CAPTION_STYLES,
  LAYOUT_MODES,
  VOICEOVER_MODES,
  type CaptionStyleId,
  type LayoutModeId,
  type VoiceoverModeId,
} from "@/lib/renderPresets";

type Props = {
  captionStyle: CaptionStyleId;
  layoutMode: LayoutModeId;
  voiceoverMode: VoiceoverModeId;
  /** Grise captions / layout / voiceover (ex. pas encore de source). */
  disabled?: boolean;
  /** Grise uniquement « Appliquer & re-rendre ». */
  applyDisabled?: boolean;
  saving?: boolean;
  onCaptionStyle: (v: CaptionStyleId) => void;
  onLayoutMode: (v: LayoutModeId) => void;
  onVoiceoverMode: (v: VoiceoverModeId) => void;
  onApplyRerender: () => void;
};

function Segmented<T extends string>({
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
      <p className="timecode text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
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
                  ? "cursor-pointer rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-xs text-signal"
                  : "cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-50"
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
 * Panneau Opus-like : captions / layout / voiceover + re-rendu.
 */
export function ClipRenderOptions({
  captionStyle,
  layoutMode,
  voiceoverMode,
  disabled,
  applyDisabled,
  saving,
  onCaptionStyle,
  onLayoutMode,
  onVoiceoverMode,
  onApplyRerender,
}: Props) {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card/40 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Rendu
        </p>
        <Button
          type="button"
          size="sm"
          disabled={applyDisabled || saving}
          onClick={onApplyRerender}
          className="cursor-pointer"
        >
          {saving ? "Re-rendu…" : "Appliquer & re-rendre"}
        </Button>
      </div>

      <Segmented
        label="Captions"
        options={CAPTION_STYLES}
        value={captionStyle}
        disabled={disabled}
        onChange={onCaptionStyle}
      />
      <Segmented
        label="Layout"
        options={LAYOUT_MODES}
        value={layoutMode}
        disabled={disabled}
        onChange={onLayoutMode}
      />
      <Segmented
        label="Voiceover"
        options={VOICEOVER_MODES}
        value={voiceoverMode}
        disabled={disabled}
        onChange={onVoiceoverMode}
      />
      <p className="text-xs text-muted-foreground">
        Les options s’enregistrent au clic. « Appliquer & re-rendre » régénère
        tous les clips. Split = 2 visages · Mix/Replace = TTS.
      </p>
    </div>
  );
}

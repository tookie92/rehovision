"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { STYLE_PRESETS } from "@/lib/stylePresets";
import { cn } from "@/lib/utils";

type Props = {
  presetId: string;
  visualStyle: string;
  narrationTone: string;
  onPresetId: (id: string) => void;
  onVisualStyle: (value: string) => void;
  onNarrationTone: (value: string) => void;
};

export function StylePresetPicker({
  presetId,
  visualStyle,
  narrationTone,
  onPresetId,
  onVisualStyle,
  onNarrationTone,
}: Props) {
  const selected =
    STYLE_PRESETS.find((p) => p.id === presetId) ?? STYLE_PRESETS[0];
  const isCustom = selected.id === "custom";

  function pickPreset(id: string) {
    const preset = STYLE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onPresetId(id);
    if (preset.id !== "custom") {
      onVisualStyle(preset.prompt);
      onNarrationTone(preset.toneHint);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label>Style d’illustration</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STYLE_PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => pickPreset(preset.id)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/40 hover:border-muted-foreground/40",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {preset.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
        <Textarea
          id="visualStyle"
          name="visualStyle"
          required
          rows={isCustom ? 3 : 2}
          value={visualStyle}
          onChange={(e) => {
            onVisualStyle(e.target.value);
            if (!isCustom) onPresetId("custom");
          }}
          placeholder="Décris le style (couleurs, technique, ambiance…)"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="narrationTone">Ton de narration</Label>
        <Input
          id="narrationTone"
          name="narrationTone"
          required
          value={narrationTone}
          onChange={(e) => onNarrationTone(e.target.value)}
          placeholder="grave, mystérieux"
        />
      </div>
    </div>
  );
}

/** Devine le preset le plus proche d'un visualStyle existant. */
export function matchPresetId(visualStyle: string): string {
  const normalized = visualStyle.trim().toLowerCase();
  const hit = STYLE_PRESETS.find(
    (p) => p.id !== "custom" && p.prompt.toLowerCase() === normalized,
  );
  return hit?.id ?? "custom";
}

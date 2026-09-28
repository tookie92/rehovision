"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { GENRE_PRESETS, type GenreId } from "@/lib/genrePresets";
import { STYLE_PRESETS, presetsForGenre } from "@/lib/stylePresets";
import { cn } from "@/lib/utils";

type Props = {
  genreId: GenreId;
  presetId: string;
  visualStyle: string;
  narrationTone: string;
  onGenreId: (id: GenreId) => void;
  onPresetId: (id: string) => void;
  onVisualStyle: (value: string) => void;
  onNarrationTone: (value: string) => void;
};

export function StylePresetPicker({
  genreId,
  presetId,
  visualStyle,
  narrationTone,
  onGenreId,
  onPresetId,
  onVisualStyle,
  onNarrationTone,
}: Props) {
  const presets = presetsForGenre(genreId);
  const selected = presets.find((p) => p.id === presetId) ?? presets[0];
  const isCustom = selected?.id === "custom";

  function pickGenre(id: GenreId) {
    onGenreId(id);
    const genre = GENRE_PRESETS.find((g) => g.id === id);
    const nextPresets = presetsForGenre(id);
    const first = nextPresets.find((p) => p.id !== "custom") ?? nextPresets[0];
    if (first && first.id !== "custom") {
      onPresetId(first.id);
      onVisualStyle(first.prompt);
      onNarrationTone(genre?.defaultTone || first.toneHint);
    } else {
      onPresetId("custom");
      if (genre?.defaultTone) onNarrationTone(genre.defaultTone);
    }
  }

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
        <Label>Genre de contenu</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {GENRE_PRESETS.map((genre) => {
            const active = genre.id === genreId;
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => pickGenre(genre.id)}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background/40 hover:border-muted-foreground/40",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  {genre.label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {genre.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Style d’illustration (preset texte)</Label>
        <p className="text-xs text-muted-foreground">
          Couleurs / technique / ambiance. Si tu uploades une référence de
          dessin ci-dessous, la référence prime sur ce preset pour le trait.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => {
            const active = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => pickPreset(preset.id)}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-3 text-left transition-colors",
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { STYLE_PRESETS } from "@/lib/stylePresets";
import {
  StylePresetPicker,
} from "@/components/StylePresetPicker";

export default function DashboardPage() {
  const studios = useQuery(api.studios.getStudiosByUser);
  const createStudio = useMutation(api.studios.createStudio);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(STYLE_PRESETS[0].id);
  const [visualStyle, setVisualStyle] = useState(STYLE_PRESETS[0].prompt);
  const [narrationTone, setNarrationTone] = useState(
    STYLE_PRESETS[0].toneHint,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      await createStudio({
        name: String(form.get("name") ?? ""),
        visualStyle: visualStyle.trim(),
        narrationTone: narrationTone.trim(),
      });
      setOpen(false);
      e.currentTarget.reset();
      setPresetId(STYLE_PRESETS[0].id);
      setVisualStyle(STYLE_PRESETS[0].prompt);
      setNarrationTone(STYLE_PRESETS[0].toneHint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-tight">
            Tes Studios
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Un Studio = une chaîne, avec son style d’illustration et son ton de
            narration.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Fermer" : "Nouveau Studio"}
        </Button>
      </div>

      {open && (
        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-xl border border-border bg-card/40 p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="ex. Maratrium Crimes"
            />
          </div>

          <StylePresetPicker
            presetId={presetId}
            visualStyle={visualStyle}
            narrationTone={narrationTone}
            onPresetId={setPresetId}
            onVisualStyle={setVisualStyle}
            onNarrationTone={setNarrationTone}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={pending || !visualStyle.trim() || !narrationTone.trim()}
          >
            {pending ? "Création…" : "Créer le Studio"}
          </Button>
        </form>
      )}

      {studios === undefined && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {studios && studios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun Studio pour l’instant. Crée le premier pour démarrer.
        </p>
      )}

      {studios && studios.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {studios.map((studio) => (
            <li key={studio._id}>
              <Link
                href={`/dashboard/studios/${studio._id}`}
                className="flex flex-col gap-1 py-5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{studio.name}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {studio.visualStyle}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:shrink-0">
                  {studio.narrationTone}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

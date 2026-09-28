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
import { type GenreId } from "@/lib/genrePresets";
import { StylePresetPicker } from "@/components/StylePresetPicker";
import { DashboardNav } from "@/components/DashboardNav";

/**
 * Gestion avancée des Studios (styles). Entrée secondaire depuis le dashboard.
 */
export default function StudiosIndexPage() {
  const studios = useQuery(api.studios.getStudiosByUser);
  const createStudio = useMutation(api.studios.createStudio);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genreId, setGenreId] = useState<GenreId>("true_crime");
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
        genre: genreId,
      });
      setOpen(false);
      e.currentTarget.reset();
      setGenreId("true_crime");
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
      <DashboardNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">
            Styles / Studios
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Un Studio = style d’illustration et ton. Optionnel — le flux
            principal crée un reel sans passer par ici.
          </p>
        </div>
        <Button
          type="button"
          className="cursor-pointer"
          onClick={() => setOpen((v) => !v)}
        >
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
            genreId={genreId}
            presetId={presetId}
            visualStyle={visualStyle}
            narrationTone={narrationTone}
            onGenreId={setGenreId}
            onPresetId={setPresetId}
            onVisualStyle={setVisualStyle}
            onNarrationTone={setNarrationTone}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="cursor-pointer"
            disabled={pending || !visualStyle.trim() || !narrationTone.trim()}
          >
            {pending ? "Création…" : "Créer le Studio"}
          </Button>
        </form>
      )}

      {studios === undefined && <Skeleton className="h-24 w-full" />}

      {studios && studios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun studio. Le prochain reel créera un studio « Défaut »
          automatiquement.
        </p>
      )}

      {studios && studios.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {studios.map((studio) => (
            <li key={studio._id}>
              <Link
                href={`/dashboard/studios/${studio._id}`}
                className="block py-5 transition-colors hover:bg-muted/30"
              >
                <p className="font-medium">{studio.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {studio.visualStyle}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

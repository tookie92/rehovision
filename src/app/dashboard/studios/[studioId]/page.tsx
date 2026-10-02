"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  StylePresetPicker,
  matchPresetId,
} from "@/components/StylePresetPicker";
import { ReferenceImageUpload } from "@/components/ReferenceImageUpload";
import { GENRE_PRESETS, type GenreId } from "@/lib/genrePresets";

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  script_ready: "Script prêt",
  generating: "Génération…",
  ready: "Prêt",
  exported: "Exporté",
};

export default function StudioPage() {
  const router = useRouter();
  const params = useParams<{ studioId: string }>();
  const studioId = params.studioId as Id<"studios">;

  const studio = useQuery(api.studios.getStudio, { studioId });
  const projects = useQuery(api.videoProjects.getVideoProjectsByStudio, {
    studioId,
  });
  const createProject = useMutation(api.videoProjects.createVideoProject);
  const updateStudio = useMutation(api.studios.updateStudio);

  const [open, setOpen] = useState(false);
  const [editStyle, setEditStyle] = useState(false);
  const [pending, setPending] = useState(false);
  const [stylePending, setStylePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styleError, setStyleError] = useState<string | null>(null);

  const [genreId, setGenreId] = useState<GenreId>("true_crime");
  const [presetId, setPresetId] = useState("custom");
  const [visualStyle, setVisualStyle] = useState("");
  const [narrationTone, setNarrationTone] = useState("");

  function openStyleEditor() {
    if (!studio) return;
    setGenreId((studio.genre as GenreId | undefined) ?? "true_crime");
    setPresetId(matchPresetId(studio.visualStyle));
    setVisualStyle(studio.visualStyle);
    setNarrationTone(studio.narrationTone);
    setStyleError(null);
    setEditStyle(true);
  }

  async function onSaveStyle(e: React.FormEvent) {
    e.preventDefault();
    if (!studio) return;
    setStyleError(null);
    setStylePending(true);
    try {
      await updateStudio({
        studioId,
        visualStyle: visualStyle.trim(),
        narrationTone: narrationTone.trim(),
        genre: genreId,
      });
      setEditStyle(false);
    } catch (err) {
      setStyleError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setStylePending(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const topic = String(form.get("topic") ?? "");
    const title = String(form.get("title") ?? "") || topic;
    try {
      const projectId = await createProject({
        studioId,
        title,
        topic,
      });
      router.push(`/dashboard/studios/${studioId}/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
    }
  }

  if (studio === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (studio === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Studio introuvable.{" "}
        <Link href="/dashboard" className="underline">
          Retour
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/studios"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Studios
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl tracking-tight">
              {studio.name}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {
                GENRE_PRESETS.find(
                  (g) => g.id === (studio.genre ?? "true_crime"),
                )?.label
              }{" "}
              · {studio.visualStyle} · {studio.narrationTone}
              {studio.referenceImageUrl ? " · réf. image" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                editStyle ? setEditStyle(false) : openStyleEditor()
              }
            >
              {editStyle ? "Annuler" : "Modifier le style"}
            </Button>
            <Button type="button" onClick={() => setOpen((v) => !v)}>
              {open ? "Fermer" : "Nouveau projet"}
            </Button>
          </div>
        </div>
      </div>

      {editStyle && (
        <form
          onSubmit={onSaveStyle}
          className="space-y-5 rounded-xl border border-border bg-card/40 p-5"
        >
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
          {styleError && (
            <p className="text-sm text-destructive">{styleError}</p>
          )}
          <Button
            type="submit"
            disabled={
              stylePending || !visualStyle.trim() || !narrationTone.trim()
            }
          >
            {stylePending ? "Enregistrement…" : "Enregistrer le style"}
          </Button>
        </form>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card/40 p-5">
        <p className="text-xs font-medium text-muted-foreground">
          Legacy / global — préfère l’upload dans Ajuster (lié au look).
        </p>
        <ReferenceImageUpload
          studioId={studioId}
          referenceImageUrl={studio.referenceImageUrl}
        />
        {studio.referenceImageUrl && (
          <p className="text-xs text-muted-foreground">
            Référence studio active : n’influence plus les images si un look
            projet est défini. Utilise Ajuster → réf. style pour ce look.
          </p>
        )}
      </section>
      {open && (
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-border bg-card/40 p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="topic">Sujet</Label>
            <Input
              id="topic"
              name="topic"
              required
              placeholder="Qui a tué Tupac ?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Titre (optionnel)</Label>
            <Input
              id="title"
              name="title"
              placeholder="Laissé vide = dérivé du sujet"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Création…" : "Créer le projet"}
          </Button>
        </form>
      )}

      {projects === undefined && <Skeleton className="h-24 w-full" />}

      {projects && projects.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun projet. Lance le premier sujet.
        </p>
      )}

      {projects && projects.length > 0 && (
        <ul className="divide-y divide-border border-y border-border">
          {projects.map((project) => (
            <li key={project._id}>
              <Link
                href={`/dashboard/studios/${studioId}/projects/${project._id}`}
                className="flex items-center justify-between gap-4 py-5 transition-colors hover:bg-muted/30"
              >
                <div>
                  <p className="font-medium">{project.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {project.topic}
                  </p>
                </div>
                <Badge variant="secondary">
                  {STATUS_LABEL[project.status] ?? project.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardNav } from "@/components/DashboardNav";

const STATUS_LABEL: Record<string, string> = {
  uploading: "Upload",
  downloading: "YouTube…",
  transcribing: "Whisper",
  proposing: "Hooks",
  rendering: "Rendu",
  ready: "Prêt",
  failed: "Échec",
};

type Mode = "youtube" | "file";

/**
 * Atelier Opus Clip : lien YouTube OU fichier → clips verticaux.
 * Le flux « reel généré » a été retiré de l’UI.
 */
export default function DashboardPage() {
  const router = useRouter();
  const projects = useQuery(api.clipProjects.listMine, { limit: 30 });
  const generateUploadUrl = useMutation(api.clipProjects.generateUploadUrl);
  const createFromUpload = useMutation(api.clipProjects.createFromUpload);
  const createFromYoutube = useMutation(api.clipProjects.createFromYoutube);

  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("youtube");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "youtube") {
        const url = youtubeUrl.trim();
        if (!url) {
          setError("Colle un lien YouTube");
          setPending(false);
          return;
        }
        const projectId = await createFromYoutube({
          youtubeUrl: url,
          title: title.trim() || undefined,
        });
        router.push(`/dashboard/clips/${projectId}`);
        return;
      }

      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Choisis un fichier vidéo");
        setPending(false);
        return;
      }
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`Upload échoué (${res.status})`);
      }
      const { storageId } = (await res.json()) as { storageId: string };
      const projectId = await createFromUpload({
        title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
        storageId: storageId as never,
      });
      router.push(`/dashboard/clips/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
    }
  }

  return (
    <div>
      <DashboardNav />

      <div className="mb-8">
        <p className="timecode text-xs text-signal">IMPORT</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          YouTube ou fichier → clips
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Comme Opus Clip : colle un lien YouTube, ou importe une vidéo. On
          transcrit, on trouve les hooks, on coupe en 9:16.
        </p>
      </div>

      <div className="mb-4 flex gap-1">
        <button
          type="button"
          onClick={() => setMode("youtube")}
          className={
            mode === "youtube"
              ? "rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground"
              : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          }
        >
          Lien YouTube
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={
            mode === "file"
              ? "rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground"
              : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          }
        >
          Fichier vidéo
        </button>
      </div>

      <form onSubmit={onSubmit} className="mb-12 max-w-xl space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titre (optionnel)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex. Podcast #12"
            disabled={pending}
          />
        </div>

        {mode === "youtube" ? (
          <div className="space-y-2">
            <Label htmlFor="yt">Lien YouTube</Label>
            <Input
              id="yt"
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={pending}
              className="h-11"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="file">Fichier</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              disabled={pending}
              className="cursor-pointer"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {pending
            ? mode === "youtube"
              ? "Téléchargement…"
              : "Import…"
            : "Lancer"}
        </Button>
      </form>

      <section>
        <h2 className="mb-4 font-display text-xl">Projets</h2>
        {projects === undefined && <Skeleton className="h-20 w-full" />}
        {projects && projects.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun projet. Importe une source ci-dessus.
          </p>
        )}
        {projects && projects.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {projects.map((p) => (
              <li key={p._id}>
                <Link
                  href={`/dashboard/clips/${p._id}`}
                  className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.sourceYoutubeUrl
                        ? p.sourceYoutubeUrl
                        : p.durationSeconds
                          ? `${Math.round(p.durationSeconds)}s`
                          : "Fichier"}
                    </p>
                  </div>
                  <span
                    className={
                      p.status === "failed"
                        ? "timecode text-xs text-destructive"
                        : p.status === "ready"
                          ? "timecode text-xs text-signal"
                          : "timecode text-xs text-muted-foreground"
                    }
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

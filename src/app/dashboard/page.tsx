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
import {
  PROJECT_STATUS_LABEL,
  isPipelineActive,
  projectStatusTone,
} from "@/lib/clipStatus";

type Mode = "youtube" | "file";

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.responseType = "json";
    const hdrs = {
      "Content-Type": file.type || "video/mp4",
      ...headers,
    };
    for (const [k, v] of Object.entries(hdrs)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Upload échoué (${xhr.status})`));
        return;
      }
      const body =
        typeof xhr.response === "object" && xhr.response !== null
          ? (xhr.response as Record<string, unknown>)
          : (JSON.parse(String(xhr.responseText || "{}")) as Record<
              string,
              unknown
            >);
      onProgress(100);
      resolve(body);
    };
    xhr.onerror = () => reject(new Error("Upload réseau échoué"));
    xhr.onabort = () => reject(new Error("Upload annulé"));
    xhr.send(file);
  });
}

/**
 * Atelier Opus Clip : lien YouTube OU fichier → clips verticaux.
 */
export default function DashboardPage() {
  const router = useRouter();
  const projects = useQuery(api.clipProjects.listMine, { limit: 30 });
  const generateUploadUrl = useMutation(api.clipProjects.generateUploadUrl);
  const createFromUpload = useMutation(api.clipProjects.createFromUpload);
  const createFromLocalUpload = useMutation(
    api.clipProjects.createFromLocalUpload,
  );
  const createFromYoutube = useMutation(api.clipProjects.createFromYoutube);

  /** Si true, POST /api/worker-upload → disque Ubuntu (voir .env.local). */
  const useWorkerUpload =
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "1" ||
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "true";

  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("youtube");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSizeMb, setFileSizeMb] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    setUploadPct(null);
    setPhase(null);
    try {
      if (mode === "youtube") {
        const url = youtubeUrl.trim();
        if (!url) {
          setError("Colle un lien YouTube");
          setPending(false);
          return;
        }
        setPhase("Création du projet…");
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
      if (file.size > 2 * 1024 * 1024 * 1024) {
        setError("Fichier trop lourd (max 2 Go).");
        setPending(false);
        return;
      }
      if (!useWorkerUpload && file.size > 500 * 1024 * 1024) {
        setError(
          "Sans upload worker local, max ~500 Mo via Convex. Configure NEXT_PUBLIC_WORKER_UPLOAD_URL.",
        );
        setPending(false);
        return;
      }

      const clipTitle = title.trim() || file.name.replace(/\.[^.]+$/, "");

      if (useWorkerUpload) {
        setPhase("Envoi vers le worker (disque local)…");
        setUploadPct(0);
        const body = await uploadWithProgress(
          "/api/worker-upload",
          file,
          setUploadPct,
          { "x-filename": file.name },
        );
        const fileId = String(body.fileId || "");
        const mediaUrl = String(body.mediaUrl || "");
        if (!fileId || !mediaUrl) {
          throw new Error(
            String(body.error || "Réponse worker incomplete (fileId/mediaUrl)"),
          );
        }
        setPhase("Lancement Whisper…");
        setUploadPct(null);
        const projectId = await createFromLocalUpload({
          title: clipTitle,
          localFileId: fileId,
          mediaUrl,
        });
        router.push(`/dashboard/clips/${projectId}`);
        return;
      }

      setPhase("Préparation upload Convex…");
      const uploadUrl = await generateUploadUrl({});
      setPhase("Envoi vers Convex…");
      setUploadPct(0);
      const body = await uploadWithProgress(uploadUrl, file, setUploadPct);
      const storageId = String(body.storageId || "");
      if (!storageId) throw new Error("Réponse upload sans storageId");
      setPhase("Lancement Whisper…");
      setUploadPct(null);
      const projectId = await createFromUpload({
        title: clipTitle,
        storageId: storageId as never,
      });
      router.push(`/dashboard/clips/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
      setUploadPct(null);
      setPhase(null);
    }
  }

  const submitLabel = (() => {
    if (!pending) return "Lancer le découpage";
    if (mode === "youtube") return phase ?? "Création…";
    if (uploadPct != null) return `Upload ${uploadPct}%…`;
    return phase ?? "Upload…";
  })();

  return (
    <div>
      <DashboardNav />

      <div className="mb-8">
        <p className="timecode text-xs text-signal">IMPORT</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">
          YouTube ou fichier → clips
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Colle un lien ou importe une vidéo. Transcription → hooks → coupe
          9:16 prête à poster.
        </p>
      </div>

      <div
        className="mb-4 flex gap-1"
        role="tablist"
        aria-label="Source d’import"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "youtube"}
          onClick={() => !pending && setMode("youtube")}
          className={
            mode === "youtube"
              ? "cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground"
              : "cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          }
        >
          Lien YouTube
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "file"}
          onClick={() => !pending && setMode("file")}
          className={
            mode === "file"
              ? "cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground"
              : "cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
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
              autoComplete="off"
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
              onChange={(e) => {
                const f = e.target.files?.[0];
                setFileName(f?.name ?? null);
                setFileSizeMb(
                  f ? Math.round((f.size / (1024 * 1024)) * 10) / 10 : null,
                );
              }}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground truncate">
                {fileName}
                {fileSizeMb != null ? ` · ${fileSizeMb} Mo` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {useWorkerUpload
                ? "Upload via worker Ubuntu (gros vlogs OK)."
                : "Gros vlogs : mets NEXT_PUBLIC_WORKER_UPLOAD=1 + WORKER_UPLOAD_URL dans .env.local."}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {submitLabel}
        </Button>
        {pending && mode === "file" && uploadPct != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-signal transition-[width] duration-200"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        )}
      </form>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">Projets</h2>
          {projects && projects.length > 0 && (
            <p className="timecode text-xs text-muted-foreground">
              {projects.length} récent{projects.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        {projects === undefined && <Skeleton className="h-20 w-full" />}
        {projects && projects.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Aucun projet. Importe une source ci-dessus pour générer des clips.
          </p>
        )}
        {projects && projects.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {projects.map((p) => {
              const active = isPipelineActive(p.status);
              return (
                <li key={p._id}>
                  <Link
                    href={`/dashboard/clips/${p._id}`}
                    className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {p.clipCount > 0
                          ? `${p.readyClipCount}/${p.clipCount} clips prêts`
                          : p.sourceYoutubeUrl
                            ? p.sourceYoutubeUrl
                            : p.durationSeconds
                              ? `${Math.round(p.durationSeconds)}s source`
                              : "Fichier"}
                        {p.failedClipCount > 0
                          ? ` · ${p.failedClipCount} échec${p.failedClipCount > 1 ? "s" : ""}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`timecode shrink-0 text-xs ${projectStatusTone(p.status)}`}
                    >
                      {active && (
                        <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
                      )}
                      {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

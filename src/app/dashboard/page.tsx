"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  FilmStrip,
  LinkSimple,
  UploadSimple,
  SpinnerGap,
} from "@phosphor-icons/react";
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
  file: File | Blob,
  onProgress: (pct: number) => void,
  headers?: Record<string, string>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.responseType = "json";
    const hdrs = {
      "Content-Type":
        file instanceof File
          ? file.type || "video/mp4"
          : "application/octet-stream",
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
      const body =
        typeof xhr.response === "object" && xhr.response !== null
          ? (xhr.response as Record<string, unknown>)
          : (() => {
              try {
                return JSON.parse(String(xhr.responseText || "{}")) as Record<
                  string,
                  unknown
                >;
              } catch {
                return {} as Record<string, unknown>;
              }
            })();
      if (xhr.status < 200 || xhr.status >= 300) {
        const detail =
          typeof body.error === "string"
            ? body.error
            : typeof body.message === "string"
              ? body.message
              : "";
        reject(
          new Error(
            detail
              ? `Upload échoué (${xhr.status}): ${detail}`
              : `Upload échoué (${xhr.status})`,
          ),
        );
        return;
      }
      onProgress(100);
      resolve(body);
    };
    xhr.onerror = () => reject(new Error("Upload réseau échoué"));
    xhr.onabort = () => reject(new Error("Upload annulé"));
    xhr.send(file);
  });
}

/** Upload par chunks via Next → worker (contourne Cloudflare 413 ~100 Mo). */
async function uploadFileChunked(
  file: File,
  onProgress: (pct: number) => void,
): Promise<Record<string, unknown>> {
  const chunkSize = 8 * 1024 * 1024; // 8 Mo
  const total = Math.max(1, Math.ceil(file.size / chunkSize));
  const initRes = await fetch(
    "/api/worker-upload-chunk?path=/upload/init",
    { method: "POST" },
  );
  const initBody = (await initRes.json()) as {
    fileId?: string;
    error?: string;
  };
  if (!initRes.ok || !initBody.fileId) {
    throw new Error(initBody.error || `Init upload échoué (${initRes.status})`);
  }
  const fileId = initBody.fileId;

  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const blob = file.slice(start, end);
    await uploadWithProgress(
      "/api/worker-upload-chunk?path=/upload/chunk",
      blob,
      (chunkPct) => {
        const base = (i / total) * 100;
        const span = (1 / total) * 100;
        onProgress(Math.min(99, Math.round(base + (span * chunkPct) / 100)));
      },
      {
        "Content-Type": "application/octet-stream",
        "x-file-id": fileId,
        "x-chunk-index": String(i),
        "x-chunk-total": String(total),
      },
    );
  }

  const doneRes = await fetch(
    "/api/worker-upload-chunk?path=/upload/complete",
    {
      method: "POST",
      headers: {
        "x-file-id": fileId,
        "x-filename": file.name,
      },
    },
  );
  const doneBody = (await doneRes.json()) as Record<string, unknown>;
  if (!doneRes.ok) {
    throw new Error(
      String(doneBody.error || `Complete upload échoué (${doneRes.status})`),
    );
  }
  onProgress(100);
  return doneBody;
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  if (n < 1024 * 1024 * 1024)
    return `${(Math.round((n / (1024 * 1024)) * 10) / 10).toFixed(1)} Mo`;
  return `${(Math.round((n / (1024 * 1024 * 1024)) * 10) / 10).toFixed(1)} Go`;
}

/**
 * Atelier Opus-style : une zone d’import claire + grille de projets.
 */
function DashboardPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clipProjects = useQuery(api.clipProjects.listMine, { limit: 30 });
  const generateUploadUrl = useMutation(api.clipProjects.generateUploadUrl);
  const createFromUpload = useMutation(api.clipProjects.createFromUpload);
  const createFromLocalUpload = useMutation(
    api.clipProjects.createFromLocalUpload,
  );
  const createFromYoutube = useMutation(api.clipProjects.createFromYoutube);

  const useWorkerUpload =
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "1" ||
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "true";

  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("file");
  const tabParam = searchParams.get("tab");

  // Faceless gelé — redirige ?tab=faceless vers hub clips
  useEffect(() => {
    if (tabParam === "faceless") {
      router.replace("/dashboard");
    }
  }, [tabParam, router]);

  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = useCallback((f: File | null | undefined) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("video/") && !f.type.startsWith("audio/")) {
      setError("Choisis une vidéo (MP4, MOV, WebM…)");
      return;
    }
    setError(null);
    setFile(f);
    setMode("file");
  }, []);

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

      if (!file) {
        setError("Glisse une vidéo ou clique pour choisir un fichier");
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
          "Sans upload worker local, max ~500 Mo. Configure NEXT_PUBLIC_WORKER_UPLOAD=1.",
        );
        setPending(false);
        return;
      }

      const clipTitle = title.trim() || file.name.replace(/\.[^.]+$/, "");

      if (useWorkerUpload) {
        setPhase("Envoi vers le worker…");
        setUploadPct(0);
        // Chunks via proxy Next (anti Cloudflare 413 ~100 Mo sur app.rehovision.com)
        const body = await uploadFileChunked(file, setUploadPct);
        const fileId = String(body.fileId || "");
        const mediaUrl = String(body.mediaUrl || "");
        if (!fileId || !mediaUrl) {
          throw new Error(
            String(body.error || "Réponse worker incomplete (fileId/mediaUrl)"),
          );
        }
        setPhase("Lancement…");
        setUploadPct(null);
        const projectId = await createFromLocalUpload({
          title: clipTitle,
          localFileId: fileId,
          mediaUrl,
        });
        router.push(`/dashboard/clips/${projectId}`);
        return;
      }

      setPhase("Préparation…");
      const uploadUrl = await generateUploadUrl({});
      setPhase("Envoi…");
      setUploadPct(0);
      const body = await uploadWithProgress(uploadUrl, file, setUploadPct);
      const storageId = String(body.storageId || "");
      if (!storageId) throw new Error("Réponse upload sans storageId");
      setPhase("Lancement…");
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
    if (!pending) return mode === "youtube" ? "Générer les clips" : "Lancer";
    if (mode === "youtube") return phase ?? "Création…";
    if (uploadPct != null) return `Envoi ${uploadPct}%`;
    return phase ?? "Envoi…";
  })();

  return (
    <div className="atelier-grain relative">
      <div className="relative z-[1]">
      <DashboardNav />

      <header className="mb-8 max-w-2xl">
        <p className="atelier-label mb-3 text-signal">Atelier clips</p>
        <h1 className="font-display text-[clamp(1.85rem,4.5vw,2.75rem)] leading-[1.05] text-foreground">
          Transforme un vlog en clips
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
          Importe une vidéo. L’IA coupe les meilleurs moments en 9:16 prêts à
          poster. Faceless est gelé pour prioriser ce parcours.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mb-14">
        <div
          role="tablist"
          aria-label="Source"
          className="mb-3 inline-flex rounded-xl border border-border bg-card/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "file"}
            disabled={pending}
            onClick={() => setMode("file")}
            className={
              mode === "file"
                ? "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground"
                : "inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            }
          >
            <UploadSimple className="size-4" weight="bold" />
            Fichier
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "youtube"}
            disabled={pending}
            onClick={() => setMode("youtube")}
            className={
              mode === "youtube"
                ? "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground"
                : "inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            }
          >
            <LinkSimple className="size-4" weight="bold" />
            YouTube
          </button>
        </div>

        {mode === "file" ? (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={
              dragOver
                ? "relative rounded-2xl border-2 border-dashed border-signal bg-signal/8 px-6 py-14 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--signal)_20%,transparent)] transition-colors"
                : "relative rounded-2xl border-2 border-dashed border-border bg-card/50 px-6 py-14 shadow-[0_20px_50px_-32px_rgb(15_59_39_/_0.3)] transition-colors hover:border-signal/35 dark:shadow-[0_20px_50px_-28px_rgb(0_0_0_/_0.5)]"
            }
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              disabled={pending}
              className="sr-only"
              id="atelier-file"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-signal">
                <FilmStrip className="size-7" weight="duotone" />
              </div>
              {file ? (
                <>
                  <p className="text-base font-medium text-foreground">
                    {file.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatBytes(file.size)}
                    {useWorkerUpload ? " · upload local" : ""}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                    className="mt-3 cursor-pointer text-sm text-signal underline-offset-4 hover:underline"
                  >
                    Changer de fichier
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-foreground">
                    Glisse ta vidéo ici
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    MP4, MOV, WebM
                    {useWorkerUpload ? " · jusqu’à 2 Go" : " · jusqu’à ~500 Mo"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    className="mt-5 cursor-pointer"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choisir un fichier
                  </Button>
                </>
              )}
            </div>
            {pending && uploadPct != null && (
              <div className="absolute inset-x-6 bottom-6">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-signal transition-[width] duration-200"
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card/40 px-5 py-6 md:px-6">
            <Label htmlFor="yt" className="text-sm font-medium">
              Lien YouTube
            </Label>
            <Input
              id="yt"
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={pending}
              className="mt-2 h-12 text-base"
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Si YouTube bloque le téléchargement, importe plutôt un fichier
              MP4.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="title" className="text-sm text-muted-foreground">
              Titre du projet (optionnel)
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                file ? file.name.replace(/\.[^.]+$/, "") : "ex. Vlog Bali"
              }
              disabled={pending}
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={pending || (mode === "file" && !file)}
            size="lg"
            className="cta-signal h-11 shrink-0 cursor-pointer border-0 px-8 shadow-[0_12px_32px_-12px_color-mix(in_oklab,var(--signal)_55%,transparent)] hover:bg-signal"
          >
            {pending && (
              <SpinnerGap className="size-4 animate-spin" weight="bold" />
            )}
            {submitLabel}
          </Button>
        </div>

        {error && (
          <p
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </form>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg tracking-tight">
            Mes projets clips
          </h2>
          {clipProjects && clipProjects.length > 0 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {clipProjects.length} récent{clipProjects.length > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {clipProjects === undefined && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        )}


        {clipProjects && clipProjects.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun clip pour l’instant. Importe une vidéo ci-dessus.
            </p>
          </div>
        )}


        {clipProjects && clipProjects.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clipProjects.map((p) => {
              const active = isPipelineActive(p.status);
              return (
                <li key={p._id}>
                  <Link
                    href={`/dashboard/clips/${p._id}`}
                    className="group flex h-full flex-col rounded-xl border border-border bg-card/50 p-4 shadow-[0_16px_40px_-28px_rgb(15_59_39_/_0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-signal/40 hover:bg-card dark:shadow-[0_16px_40px_-24px_rgb(0_0_0_/_0.45)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-signal">
                        {p.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${projectStatusTone(p.status)}`}
                      >
                        {active && (
                          <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
                        )}
                        {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Clip
                      {p.clipCount > 0
                        ? ` · ${p.readyClipCount}/${p.clipCount} prêts`
                        : p.sourceYoutubeUrl
                          ? " · YouTube"
                          : p.durationSeconds
                            ? ` · ${Math.round(p.durationSeconds)}s`
                            : " · Fichier"}
                      {p.failedClipCount > 0
                        ? ` · ${p.failedClipCount} échec${p.failedClipCount > 1 ? "s" : ""}`
                        : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        
      </section>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="atelier-grain relative">
          <div className="relative z-[1] space-y-6">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-12 w-80" />
            <Skeleton className="h-40 w-full max-w-xl" />
          </div>
        </div>
      }
    >
      <DashboardPageInner />
    </Suspense>
  );
}

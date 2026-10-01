"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  FilmStrip,
  LinkSimple,
  UploadSimple,
  SpinnerGap,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardNav } from "@/components/DashboardNav";
import {
  PROJECT_STATUS_LABEL,
  FACELESS_STATUS_LABEL,
  isPipelineActive,
  isFacelessPipelineActive,
  projectStatusTone,
  facelessStatusTone,
} from "@/lib/clipStatus";
import {
  FACELESS_LOOKS,
  FACELESS_VOICES,
  DEFAULT_FACELESS_LOOK_ID,
  DEFAULT_FACELESS_VOICE_ID,
  type FacelessLookId,
  type FacelessVoiceId,
} from "@/lib/facelessPresets";

type Mode = "youtube" | "file";
type DashTab = "clips" | "faceless";

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

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  if (n < 1024 * 1024 * 1024)
    return `${(Math.round((n / (1024 * 1024)) * 10) / 10).toFixed(1)} Mo`;
  return `${(Math.round((n / (1024 * 1024 * 1024)) * 10) / 10).toFixed(1)} Go`;
}

/**
 * Atelier Opus-style : une zone d’import claire + grille de projets.
 */
export default function DashboardPage() {
  const router = useRouter();
  const clipProjects = useQuery(api.clipProjects.listMine, { limit: 30 });
  const facelessProjects = useQuery(api.videoProjects.getRecentProjects, {
    limit: 30,
  });
  const generateUploadUrl = useMutation(api.clipProjects.generateUploadUrl);
  const createFromUpload = useMutation(api.clipProjects.createFromUpload);
  const createFromLocalUpload = useMutation(
    api.clipProjects.createFromLocalUpload,
  );
  const createFromYoutube = useMutation(api.clipProjects.createFromYoutube);
  const createAndStartReel = useMutation(api.videoProjects.createAndStartReel);

  const useWorkerUpload =
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "1" ||
    process.env.NEXT_PUBLIC_WORKER_UPLOAD === "true";

  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("file");
  const [dashTab, setDashTab] = useState<DashTab>("clips");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [facelessTopic, setFacelessTopic] = useState("");
  const [facelessLookId, setFacelessLookId] = useState<FacelessLookId>(
    DEFAULT_FACELESS_LOOK_ID,
  );
  const [facelessVoiceId, setFacelessVoiceId] = useState<FacelessVoiceId>(
    DEFAULT_FACELESS_VOICE_ID,
  );
  const [facelessPending, setFacelessPending] = useState(false);
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

  async function onFacelessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const topic = facelessTopic.trim();
    if (!topic) {
      setError("Écris un sujet pour le reel faceless");
      return;
    }
    setFacelessPending(true);
    try {
      const { projectId, studioId } = await createAndStartReel({
        topic,
        lookId: facelessLookId,
        voiceId: facelessVoiceId,
      });
      router.push(`/dashboard/studios/${studioId}/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setFacelessPending(false);
    }
  }

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
        <p className="atelier-label mb-3 text-signal">Atelier</p>
        <h1 className="font-display text-[clamp(1.85rem,4.5vw,2.75rem)] leading-[1.05] text-foreground">
          {dashTab === "clips"
            ? "Transforme un vlog en clips"
            : "Reel faceless depuis un sujet"}
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
          {dashTab === "clips"
            ? "Importe une vidéo. L’IA coupe les meilleurs moments en 9:16 prêts à poster."
            : "Sujet → script Ollama → images Flux → voix → montage 9:16. Pipeline séparé des clips."}
        </p>
        <div
          role="tablist"
          aria-label="Mode atelier"
          className="mt-5 inline-flex rounded-xl border border-border bg-card/60 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={dashTab === "clips"}
            onClick={() => {
              setDashTab("clips");
              setError(null);
            }}
            className={
              dashTab === "clips"
                ? "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground"
                : "inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            <FilmStrip className="size-4" weight="bold" />
            Clips
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dashTab === "faceless"}
            onClick={() => {
              setDashTab("faceless");
              setError(null);
            }}
            className={
              dashTab === "faceless"
                ? "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground"
                : "inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            <Sparkle className="size-4" weight="bold" />
            Faceless
          </button>
        </div>
      </header>

      {dashTab === "faceless" ? (
        <form onSubmit={onFacelessSubmit} className="mb-14 max-w-2xl space-y-5">
          <div className="space-y-2">
            <Label>Style illustration</Label>
            <p className="text-xs text-muted-foreground">
              Choisi avant génération — s’applique à toutes les scènes.
            </p>
            <div
              role="listbox"
              aria-label="Style illustration"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {FACELESS_LOOKS.map((look) => {
                const active = facelessLookId === look.id;
                return (
                  <button
                    key={look.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={facelessPending}
                    title={look.hint}
                    onClick={() => setFacelessLookId(look.id)}
                    className={
                      active
                        ? "cursor-pointer rounded-xl border border-signal/50 bg-signal/15 px-3 py-2.5 text-left transition-colors"
                        : "cursor-pointer rounded-xl border border-border bg-card/50 px-3 py-2.5 text-left hover:border-signal/30 disabled:opacity-50"
                    }
                  >
                    <span
                      className={
                        active
                          ? "block text-sm font-semibold text-signal"
                          : "block text-sm font-medium text-foreground"
                      }
                    >
                      {look.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {look.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Voix OmniVoice</Label>
            <p className="text-xs text-muted-foreground">
              Voice-design — regen toutes les scènes si tu changes plus tard.
            </p>
            <div
              role="listbox"
              aria-label="Voix"
              className="flex flex-wrap gap-1.5"
            >
              {FACELESS_VOICES.map((voice) => {
                const active = facelessVoiceId === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={facelessPending}
                    title={voice.hint}
                    onClick={() => setFacelessVoiceId(voice.id)}
                    className={
                      active
                        ? "cursor-pointer rounded-lg bg-signal/20 px-3 py-2 text-xs font-semibold text-signal ring-1 ring-signal/45"
                        : "cursor-pointer rounded-lg bg-secondary/80 px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    }
                  >
                    {voice.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="faceless-topic">Sujet du reel</Label>
            <Input
              id="faceless-topic"
              value={facelessTopic}
              onChange={(e) => setFacelessTopic(e.target.value)}
              placeholder="ex. L’affaire du train de nuit en 1892"
              disabled={facelessPending}
              className="h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={facelessPending}
            className="cta-signal h-11 cursor-pointer border-0 px-6 hover:bg-signal"
          >
            {facelessPending ? (
              <>
                <SpinnerGap className="size-4 animate-spin" weight="bold" />
                Lancement…
              </>
            ) : (
              "Générer le reel"
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Styles avancés / référence :{" "}
            <Link
              href="/dashboard/studios"
              className="text-signal underline-offset-2 hover:underline"
            >
              Studios
            </Link>
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
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
      )}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg tracking-tight">
            {dashTab === "faceless" ? "Mes reels faceless" : "Mes projets clips"}
          </h2>
          {dashTab === "clips" && clipProjects && clipProjects.length > 0 && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {clipProjects.length} récent{clipProjects.length > 1 ? "s" : ""}
            </p>
          )}
          {dashTab === "faceless" &&
            facelessProjects &&
            facelessProjects.length > 0 && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {facelessProjects.length} récent
                {facelessProjects.length > 1 ? "s" : ""}
              </p>
            )}
        </div>

        {dashTab === "clips" && clipProjects === undefined && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        )}

        {dashTab === "faceless" && facelessProjects === undefined && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        )}

        {dashTab === "clips" && clipProjects && clipProjects.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun clip pour l’instant. Importe une vidéo ci-dessus.
            </p>
          </div>
        )}

        {dashTab === "faceless" &&
          facelessProjects &&
          facelessProjects.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun reel faceless encore. Lance un sujet ci-dessus.
              </p>
            </div>
          )}

        {dashTab === "clips" && clipProjects && clipProjects.length > 0 && (
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

        {dashTab === "faceless" &&
          facelessProjects &&
          facelessProjects.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {facelessProjects.map(({ project: p, studioName }) => {
                const active = isFacelessPipelineActive(p.status);
                return (
                  <li key={p._id}>
                    <Link
                      href={`/dashboard/studios/${p.studioId}/projects/${p._id}`}
                      className="group flex h-full flex-col rounded-xl border border-border bg-card/50 p-4 shadow-[0_16px_40px_-28px_rgb(15_59_39_/_0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-signal/40 hover:bg-card dark:shadow-[0_16px_40px_-24px_rgb(0_0_0_/_0.45)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-signal">
                          {p.title || p.topic}
                        </p>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${facelessStatusTone(p.status)}`}
                        >
                          {active && (
                            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
                          )}
                          {FACELESS_STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-1 text-xs text-muted-foreground">
                        Faceless · {studioName}
                        {p.finalVideoUrl ? " · vidéo prête" : ""}
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

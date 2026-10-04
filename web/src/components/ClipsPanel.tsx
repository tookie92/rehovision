"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { Clapperboard } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { ClipProjectsList } from "./ClipProjectsList";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  CHUNK_THRESHOLD_BYTES,
  uploadVideoChunked,
} from "../lib/uploadVideoChunked";

const HOOKS = [8, 15, 30, 60, 90] as const;

export function ClipsPanel({
  sessionId,
  jobs,
  jobsLoading,
}: {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
}) {
  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const [file, setFile] = useState<File | null>(null);
  const [hookDurationS, setHookDurationS] = useState<(typeof HOOKS)[number]>(30);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  async function uploadSource(f: File): Promise<string> {
    if (f.size > CHUNK_THRESHOLD_BYTES) {
      setUploadProgress("Envoi 0/…");
      return uploadVideoChunked(f, sessionId, (done, total) => {
        setUploadProgress(`Envoi ${done}/${total}…`);
      });
    }
    setUploadProgress("Envoi…");
    const uploadUrl = await generateUploadUrl({ sessionId });
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": f.type || "video/mp4" },
      body: f,
    });
    if (!res.ok) throw new Error(`Upload vidéo échoué (${res.status})`);
    const body = (await res.json()) as { storageId?: string };
    if (!body.storageId) throw new Error("Upload sans storageId");
    return body.storageId;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !file) return;
    setSubmitting(true);
    setUploadProgress(null);
    try {
      const storageId = await uploadSource(file);
      setUploadProgress("Création du projet…");
      await createJob({
        type: "clips",
        sessionId,
        params: {
          sourceStorageId: storageId,
          hookDurationS,
          fileName: file.name,
          title: title.trim() || file.name,
          engine: "hooks-ffmpeg",
        },
      });
      setFile(null);
      setTitle("");
      setUploadProgress(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec envoi");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Clips
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Un projet = une vidéo source. On propose plusieurs hooks (début + pics
          d’énergie) ; chaque suggestion crée une{" "}
          <strong className="font-semibold text-[var(--ink)]">version</strong>{" "}
          sous la source.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
      >
        <Label>
          <span>Vidéo source</span>
          <input
            type="file"
            accept="video/*,.mp4,.mov,.webm,.mkv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[var(--ink)] file:px-4 file:text-sm file:font-semibold file:text-white"
          />
          {file && (
            <span className="text-xs font-normal text-[var(--muted)]">
              {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} Mo
              {file.size > CHUNK_THRESHOLD_BYTES
                ? " · upload chunké (>80 Mo)"
                : ""}
            </span>
          )}
        </Label>

        <Label>
          <span>Titre (optionnel)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mon vlog"
            className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-[var(--signal)]/30"
          />
        </Label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Durée des hooks</legend>
          <div className="flex flex-wrap gap-2">
            {HOOKS.map((d) => (
              <Button
                key={d}
                type="button"
                variant={hookDurationS === d ? "default" : "outline"}
                onClick={() => setHookDurationS(d)}
              >
                {d}s
              </Button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            60–90 s alignés Reels / Shorts. Plusieurs candidats sur toute la
            timeline.
          </p>
        </fieldset>

        <Button
          type="submit"
          disabled={submitting || !sessionId || !file}
          className="w-full sm:w-auto sm:min-w-[200px]"
        >
          <Clapperboard className="size-4" aria-hidden />
          {submitting
            ? uploadProgress || "Envoi…"
            : "Créer le projet"}
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tes projets</h2>
        <ClipProjectsList
          jobs={jobs}
          loading={jobsLoading}
          sessionId={sessionId}
        />
      </section>
    </section>
  );
}

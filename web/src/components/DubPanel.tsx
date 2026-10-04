"use client";

import { useMutation } from "convex/react";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Mic2, Sparkles } from "lucide-react";
import { api } from "@convex/_generated/api";
import { LangPicker } from "./LangPicker";
import { JobList } from "./JobList";
import type { Doc } from "@convex/_generated/dataModel";

type DubMode = "narration" | "doublage";
type Step = 1 | 2 | 3;

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
};

export function DubPanel({ sessionId, jobs, jobsLoading }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [dubMode, setDubMode] = useState<DubMode>("narration");
  const [text, setText] = useState(
    "Bonjour, bienvenue dans notre atelier. Aujourd'hui on parle de création locale.",
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [voiceRefFile, setVoiceRefFile] = useState<File | null>(null);
  const [voiceMode, setVoiceMode] = useState<"keep" | "model">("keep");
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("wo");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [sourceTextSnap, setSourceTextSnap] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const cloneVoice = voiceMode === "keep";

  const step1Ok =
    !!sessionId &&
    (dubMode === "narration"
      ? text.trim().length > 0
      : audioFile !== null);

  const step2Ok =
    step1Ok &&
    !!sourceLang &&
    !!targetLang &&
    !(cloneVoice && dubMode === "narration" && !voiceRefFile && !audioFile);

  const canPrepare = step2Ok && text.trim().length > 0;

  const canSubmit =
    step === 3 &&
    voiceConsent &&
    spokenText.trim().length > 0 &&
    step2Ok;

  async function uploadAudio(file: File): Promise<string> {
    const uploadUrl = await generateUploadUrl({ sessionId });
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      throw new Error(`Upload audio échoué (${res.status})`);
    }
    const body = (await res.json()) as { storageId?: string };
    if (!body.storageId) {
      throw new Error("Upload sans storageId");
    }
    return body.storageId;
  }

  async function onPrepare() {
    if (!canPrepare) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/preview-dub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          sourceLang,
          targetLang,
        }),
      });
      const body = (await res.json()) as {
        spokenText?: string;
        sourceText?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Préparation échouée (${res.status})`);
      }
      if (!body.spokenText?.trim()) {
        throw new Error("Aperçu vide — réessaie.");
      }
      setSpokenText(body.spokenText.trim());
      setSourceTextSnap(body.sourceText?.trim() || text.trim());
      setStep(3);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Échec préparation");
    } finally {
      setPreviewing(false);
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !sessionId) return;
    setSubmitting(true);
    try {
      let sourceStorageId: string | undefined;
      let refStorageId: string | undefined;
      if (dubMode === "doublage" && audioFile) {
        sourceStorageId = await uploadAudio(audioFile);
      }
      if (cloneVoice && voiceRefFile) {
        refStorageId = await uploadAudio(voiceRefFile);
      }

      await createJob({
        type: dubMode === "doublage" ? "dub" : "narration",
        sessionId,
        params: {
          ...(dubMode === "narration" || text.trim()
            ? { text: text.trim() }
            : {}),
          ...(sourceStorageId ? { sourceStorageId } : {}),
          ...(refStorageId ? { refStorageId } : {}),
          sourceLang,
          targetLang,
          targetText: spokenText.trim(),
          autoTranslate: false,
          cloneVoice,
          voiceMode,
          voiceConsent: true,
          consentAt: Date.now(),
          mode: dubMode,
          engine: "auto",
        },
      });
      setAudioFile(null);
      setVoiceRefFile(null);
      setStep(1);
      setSpokenText("");
      setSourceTextSnap("");
      setVoiceConsent(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec envoi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Doublage & narration
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Contenu → langues & voix → aperçu du texte lu → génération.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2 text-xs font-medium">
        {(
          [
            [1, "Contenu"],
            [2, "Langues & voix"],
            [3, "Aperçu"],
          ] as const
        ).map(([n, label]) => (
          <li
            key={n}
            className={
              step === n
                ? "rounded-lg bg-[var(--ink)] px-3 py-1.5 text-white"
                : step > n
                  ? "rounded-lg bg-[var(--bg-subtle)] px-3 py-1.5 text-[var(--ink)]"
                  : "rounded-lg border border-[var(--line)] px-3 py-1.5 text-[var(--muted)]"
            }
          >
            {n}. {label}
          </li>
        ))}
      </ol>

      <form
        onSubmit={onGenerate}
        className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
      >
        {step === 1 && (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Type</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["narration", "Narration"],
                    ["doublage", "Doublage"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDubMode(id)}
                    className={
                      dubMode === id
                        ? "min-h-11 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white"
                        : "min-h-11 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {dubMode === "doublage" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">Audio source</span>
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                  onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[var(--ink)] file:px-4 file:text-sm file:font-semibold file:text-white"
                />
                {audioFile && (
                  <span className="text-xs text-[var(--muted)]">
                    {audioFile.name} · {(audioFile.size / 1024).toFixed(0)} Ko
                  </span>
                )}
              </label>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium">
                {dubMode === "narration"
                  ? "Script"
                  : "Script (requis pour l’aperçu)"}
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={dubMode === "narration" ? 6 : 4}
                className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-shadow duration-200 focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                placeholder={
                  dubMode === "narration"
                    ? "Colle le texte à narrer…"
                    : "Colle le texte à traduire pour l’aperçu…"
                }
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!step1Ok}
                onClick={() => setStep(2)}
                className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Continuer
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <LangPicker
                label="Langue source"
                value={sourceLang}
                onChange={setSourceLang}
              />
              <LangPicker
                label="Langue cible"
                value={targetLang}
                onChange={setTargetLang}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Voix</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setVoiceMode("keep")}
                  className={
                    voiceMode === "keep"
                      ? "min-h-14 rounded-xl bg-[var(--ink)] px-4 py-3 text-left text-sm font-semibold text-white"
                      : "min-h-14 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                  }
                >
                  Garder ma voix
                  <span
                    className={
                      voiceMode === "keep"
                        ? "mt-0.5 block text-xs font-normal text-white/70"
                        : "mt-0.5 block text-xs font-normal text-[var(--muted)]"
                    }
                  >
                    Clone depuis l’échantillon
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceMode("model")}
                  className={
                    voiceMode === "model"
                      ? "min-h-14 rounded-xl bg-[var(--ink)] px-4 py-3 text-left text-sm font-semibold text-white"
                      : "min-h-14 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                  }
                >
                  Voix modèle
                  <span
                    className={
                      voiceMode === "model"
                        ? "mt-0.5 block text-xs font-normal text-white/70"
                        : "mt-0.5 block text-xs font-normal text-[var(--muted)]"
                    }
                  >
                    OmniVoice sans clone
                  </span>
                </button>
              </div>
            </fieldset>

            {voiceMode === "keep" && dubMode === "narration" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium">
                  Échantillon de ta voix
                </span>
                <input
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                  onChange={(e) =>
                    setVoiceRefFile(e.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[var(--ink)] file:px-4 file:text-sm file:font-semibold file:text-white"
                />
                {voiceRefFile && (
                  <span className="text-xs text-[var(--muted)]">
                    {voiceRefFile.name} ·{" "}
                    {(voiceRefFile.size / 1024).toFixed(0)} Ko
                  </span>
                )}
              </label>
            )}

            {previewError && (
              <p className="rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-ink)]">
                {previewError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Retour
              </button>
              <button
                type="button"
                disabled={!canPrepare || previewing}
                onClick={() => void onPrepare()}
                className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Sparkles className="size-4" aria-hidden />
                {previewing ? "Préparation…" : "Préparer la traduction"}
              </button>
            </div>
            {!text.trim() && dubMode === "doublage" && (
              <p className="text-xs text-[var(--muted)]">
                Ajoute un script à l’étape Contenu pour préparer l’aperçu.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            {sourceTextSnap && (
              <p className="text-xs text-[var(--muted)]">
                Source · {sourceLang} → {targetLang}
              </p>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium">Texte lu (aperçu)</span>
              <textarea
                value={spokenText}
                onChange={(e) => setSpokenText(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-shadow duration-200 focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                placeholder="Corrige légèrement si besoin…"
              />
              <p className="text-xs text-[var(--muted)]">
                Tu peux ajuster avant génération. Ce texte est envoyé tel quel
                au TTS (pas de re-traduction).
              </p>
            </label>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
              <input
                type="checkbox"
                checked={voiceConsent}
                onChange={(e) => setVoiceConsent(e.target.checked)}
                className="mt-1 size-4 accent-[var(--ink)]"
              />
              <span className="text-sm leading-snug text-[var(--ink)]">
                Je confirme disposer du{" "}
                <strong className="font-semibold">consentement explicite</strong>{" "}
                pour toute voix / clonage audio.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Retour
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Mic2 className="size-4" aria-hidden />
                {submitting ? "Envoi…" : "Générer"}
              </button>
            </div>
          </div>
        )}
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique doublage</h2>
        <JobList jobs={jobs} loading={jobsLoading} />
      </section>
    </section>
  );
}

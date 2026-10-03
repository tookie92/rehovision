"use client";

import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { AudioLines, Clapperboard, Languages, Library, Mic2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { getSessionId } from "../lib/session";
import { LANGUAGES } from "../lib/languages";
import { JobList } from "../components/JobList";
import { ClipsPanel } from "../components/ClipsPanel";
import { MediaByStorage } from "../components/MediaByStorage";

type Tab = "dub" | "clips" | "music" | "library";
type DubMode = "narration" | "doublage";

const TABS: { id: Tab; label: string; icon: typeof Mic2 }[] = [
  { id: "dub", label: "Doublage", icon: Languages },
  { id: "clips", label: "Clips", icon: Clapperboard },
  { id: "music", label: "Musique", icon: AudioLines },
  { id: "library", label: "Bibliothèque", icon: Library },
];

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("dub");
  const [sessionId, setSessionId] = useState("");

  // Musique
  const [prompt, setPrompt] = useState("Ambiance lo-fi calme pour vlog");
  const [durationS, setDurationS] = useState(30);

  // Doublage / narration
  const [dubMode, setDubMode] = useState<DubMode>("narration");
  const [text, setText] = useState(
    "Bonjour, bienvenue dans notre atelier. Aujourd'hui on parle de création locale.",
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("fr");
  const [voiceConsent, setVoiceConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const jobs = useQuery(
    api.jobs.listBySession,
    sessionId ? { sessionId } : "skip",
  );
  const library = useQuery(api.library.list);

  const filteredJobs =
    jobs?.filter((j) => {
      if (tab === "music") return j.type === "music";
      if (tab === "dub") return j.type === "dub" || j.type === "narration";
      if (tab === "clips")
        return (
          j.type === "clips" ||
          j.type === "clip_edit" ||
          j.type === "clip_suggest"
        );
      return true;
    }) ?? undefined;

  const canSubmitDub =
    !!sessionId &&
    voiceConsent &&
    (dubMode === "narration" ? text.trim().length > 0 : audioFile !== null);

  async function onMusic(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !prompt.trim()) return;
    setSubmitting(true);
    try {
      await createJob({
        type: "music",
        sessionId,
        params: { prompt: prompt.trim(), durationS },
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onDub(e: FormEvent) {
    e.preventDefault();
    if (!canSubmitDub || !sessionId) return;
    setSubmitting(true);
    try {
      let sourceStorageId: string | undefined;
      if (dubMode === "doublage" && audioFile) {
        const uploadUrl = await generateUploadUrl({ sessionId });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": audioFile.type || "application/octet-stream" },
          body: audioFile,
        });
        if (!res.ok) {
          throw new Error(`Upload audio échoué (${res.status})`);
        }
        const body = (await res.json()) as { storageId?: string };
        if (!body.storageId) {
          throw new Error("Upload sans storageId");
        }
        sourceStorageId = body.storageId;
      }

      await createJob({
        type: dubMode === "doublage" ? "dub" : "narration",
        sessionId,
        params: {
          ...(dubMode === "narration" || text.trim()
            ? { text: text.trim() }
            : {}),
          ...(sourceStorageId ? { sourceStorageId } : {}),
          sourceLang,
          targetLang,
          voiceConsent: true,
          consentAt: Date.now(),
          mode: dubMode,
          engine: "auto",
        },
      });
      setAudioFile(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec envoi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-[var(--line)] bg-[var(--bg-elevated)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">
              Rehovision
            </p>
            <p className="text-xs text-[var(--muted)]">Studio voix & musique</p>
          </div>
          <p className="hidden text-xs text-[var(--muted)] sm:block">
            GPU local · 1 job à la fois
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-10">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Outils">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={
                    active
                      ? "flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--ink)] px-3.5 py-2.5 text-sm font-semibold text-white transition-colors duration-200"
                      : "flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]"
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </button>
              );
            })}
          </nav>
          <p className="mt-4 hidden rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--warn-ink)] lg:block">
            Aucune authentification. Ne pas exposer publiquement avant Convex Auth
            ou équivalent.
          </p>
        </aside>

        <div className="min-w-0 space-y-8">
          <p className="rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-ink)] lg:hidden">
            Aucune authentification. Ne pas exposer publiquement.
          </p>

          {tab === "clips" && (
            <ClipsPanel
              sessionId={sessionId}
              jobs={filteredJobs}
              jobsLoading={!sessionId || jobs === undefined}
            />
          )}

          {tab === "dub" && (
            <section className="space-y-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Doublage & narration
                </h1>
                <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                  Narration : texte → TTS. Doublage : audio → Whisper → traduction
                  (Ollama) → voix. Piper FR pour le français ; OmniVoice ensuite.
                </p>
              </div>

              <form
                onSubmit={onDub}
                className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
              >
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Mode</legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["narration", "Narration (texte)"],
                        ["doublage", "Doublage (audio)"],
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
                      onChange={(e) =>
                        setAudioFile(e.target.files?.[0] ?? null)
                      }
                      required
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
                      : "Script (optionnel — sinon Whisper)"}
                  </span>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={dubMode === "narration" ? 7 : 4}
                    required={dubMode === "narration"}
                    className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-shadow duration-200 focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                    placeholder={
                      dubMode === "narration"
                        ? "Colle le texte à narrer…"
                        : "Laisse vide pour transcrire l’audio, ou colle une transcription…"
                    }
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Langue source</span>
                    <select
                      value={sourceLang}
                      onChange={(e) => setSourceLang(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Langue cible</span>
                    <select
                      value={targetLang}
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
                  <input
                    type="checkbox"
                    checked={voiceConsent}
                    onChange={(e) => setVoiceConsent(e.target.checked)}
                    className="mt-1 size-4 accent-[var(--ink)]"
                    required
                  />
                  <span className="text-sm leading-snug text-[var(--ink)]">
                    Je confirme disposer du{" "}
                    <strong className="font-semibold">consentement explicite</strong>{" "}
                    pour toute voix / clonage utilisé. Interdit : usurpation, fraude.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || !canSubmitDub}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-40 sm:w-auto sm:min-w-[200px]"
                >
                  <Mic2 className="size-4" aria-hidden />
                  {submitting
                    ? "Envoi…"
                    : dubMode === "doublage"
                      ? "Lancer le doublage"
                      : "Générer la voix"}
                </button>
                <p className="text-xs text-[var(--muted)]">
                  Pipeline : Whisper (CPU) → Ollama ({`llama3.2`}) → Piper FR si cible
                  français. Autres cibles : stub jusqu’à OmniVoice.
                </p>
              </form>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Historique doublage</h2>
                <JobList
                  jobs={filteredJobs}
                  loading={!sessionId || jobs === undefined}
                />
              </section>
            </section>
          )}

          {tab === "music" && (
            <section className="space-y-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Musique
                </h1>
                <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                  Prompt → ACE-Step (ou moteur de test). Résultat en temps réel.
                </p>
              </div>

              <form
                onSubmit={onMusic}
                className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
              >
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    required
                    className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 outline-none transition-shadow duration-200 focus:ring-2 focus:ring-[var(--signal)]/30"
                    placeholder="Décris l'ambiance…"
                  />
                </label>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Durée</legend>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDurationS(d)}
                        className={
                          durationS === d
                            ? "min-h-11 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white"
                            : "min-h-11 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                        }
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={submitting || !sessionId}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto sm:min-w-[200px]"
                >
                  <AudioLines className="size-4" aria-hidden />
                  {submitting ? "Envoi…" : "Générer"}
                </button>
              </form>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Historique musique</h2>
                <JobList
                  jobs={filteredJobs}
                  loading={!sessionId || jobs === undefined}
                />
              </section>
            </section>
          )}

          {tab === "library" && (
            <section className="space-y-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Bibliothèque
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Ambiances pré-générées (bench ACE-Step).
                </p>
              </div>
              {library === undefined ? (
                <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--bg-subtle)]" />
              ) : library.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--muted)]">
                  Vide pour l&apos;instant. Après ACE-Step :{" "}
                  <code className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-xs">
                    worker/bench_music.py --upload
                  </code>
                </p>
              ) : (
                <ul className="space-y-3">
                  {library.map((item) => (
                    <li
                      key={item._id}
                      className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)]"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{item.title}</p>
                        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          {item.mood} · {item.durationS}s
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{item.prompt}</p>
                      <div className="mt-3">
                        <MediaByStorage storageId={item.storageId} kind="audio" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

"use client";

import {
  FormEvent,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Mic2, Sparkles, Users } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { LangPicker } from "./LangPicker";
import { JobList } from "./JobList";
import { PUBLIC_VOICES, type PublicVoice } from "../lib/publicVoices";
import {
  detectSpeakers,
  NARRATOR_KEY,
  splitAudiobookText,
} from "../lib/audiobookSplit";

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
};

const EXPRESS_TAGS = [
  { tag: "[laughter]", label: "Rire" },
  { tag: "[sigh]", label: "Soupir" },
  { tag: "[surprise-oh]", label: "Surprise" },
  { tag: "[surprise-ah]", label: "Étonnement" },
  { tag: "[question-en]", label: "Question" },
  { tag: "[confirmation-en]", label: "Hmm" },
  { tag: "[dissatisfaction-hnn]", label: "Mécontent" },
] as const;

const DEFAULT_TEXT = `# Chapitre 1

Le soleil se lève sur le marché.

Amina: Bonjour ! Bienvenue dans notre atelier.
Omar: [laughter] Salut Amina. On raconte une histoire locale aujourd'hui ?
Amina: Oui — écoute bien.

Ils s'installent sous le baobab.

# Chapitre 2

Omar: [sigh] La suite est plus calme.
Amina: [surprise-oh] Attends, regarde là-bas !`;

const CAST_VOICES = PUBLIC_VOICES.filter((v) => !!v.instruct);

function insertAtCursor(
  value: string,
  setValue: (v: string) => void,
  ref: RefObject<HTMLTextAreaElement | null>,
  insert: string,
) {
  const el = ref.current;
  const chunk = insert.endsWith(" ") ? insert : `${insert} `;
  if (!el) {
    setValue(`${value}${chunk}`);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + chunk + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + chunk.length;
    el.setSelectionRange(pos, pos);
  });
}

function guessVoiceId(name: string): string {
  const low = name.toLowerCase();
  const exact = CAST_VOICES.find((v) => v.name.toLowerCase() === low);
  if (exact) return exact.id;
  if (low.includes("amin")) return "amina";
  if (low.includes("omar") || low.includes("ibrah")) return "omar";
  if (low.includes("fatou") || low.includes("mari")) return "fatou";
  // Heuristique genre par terminaison
  if (/a$|ine$|elle$|ette$/i.test(name)) return "amina";
  return "omar";
}

function voiceLabel(id: string | undefined): string {
  if (!id) return "—";
  return CAST_VOICES.find((v) => v.id === id)?.name ?? id;
}

export function AudiobookPanel({ sessionId, jobs, jobsLoading }: Props) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [title, setTitle] = useState("Mon livre audio");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("en");
  const [cloneMode, setCloneMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [voiceRefFile, setVoiceRefFile] = useState<File | null>(null);
  const [presetRefStorageId, setPresetRefStorageId] = useState<
    Id<"_storage"> | null
  >(null);
  /** speaker → public voice id */
  const [cast, setCast] = useState<Record<string, string>>({
    [NARRATOR_KEY]: "amina",
  });
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const savedVoices = useQuery(
    api.voices.listBySession,
    sessionId ? { sessionId } : "skip",
  );

  const chapters = useMemo(() => splitAudiobookText(text, 600), [text]);
  const speakers = useMemo(() => detectSpeakers(text), [text]);
  const castRoles = useMemo(
    () => [NARRATOR_KEY, ...speakers],
    [speakers],
  );
  const charCount = text.trim().length;

  // Auto-assigne une voix aux nouveaux personnages (style ElevenLabs)
  useEffect(() => {
    setCast((prev) => {
      const next = { ...prev };
      if (!next[NARRATOR_KEY]) next[NARRATOR_KEY] = "amina";
      for (const name of speakers) {
        if (!next[name]) next[name] = guessVoiceId(name);
      }
      return next;
    });
  }, [speakers]);

  const narratorVoice: PublicVoice | undefined = CAST_VOICES.find(
    (v) => v.id === cast[NARRATOR_KEY],
  );
  const instruct = cloneMode ? "" : narratorVoice?.instruct || "";

  const canSubmit =
    !!sessionId &&
    charCount > 20 &&
    chapters.length > 0 &&
    chapters.length <= 80 &&
    !!sourceLang &&
    !!targetLang &&
    voiceConsent &&
    !(cloneMode && !voiceRefFile && !presetRefStorageId) &&
    !(!cloneMode && !instruct);

  async function uploadAudio(file: File): Promise<string> {
    const uploadUrl = await generateUploadUrl({ sessionId });
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload échoué (${res.status})`);
    const body = (await res.json()) as { storageId?: string };
    if (!body.storageId) throw new Error("Upload sans storageId");
    return body.storageId;
  }

  function buildSpeakersParam():
    | Record<string, { instruct: string }>
    | undefined {
    if (cloneMode) return undefined;
    const map: Record<string, { instruct: string }> = {};
    for (const role of castRoles) {
      const vid = cast[role];
      const pub = CAST_VOICES.find((v) => v.id === vid);
      if (pub?.instruct) map[role] = { instruct: pub.instruct };
    }
    return Object.keys(map).length ? map : undefined;
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let refStorageId: string | undefined;
      if (cloneMode && voiceRefFile) {
        refStorageId = await uploadAudio(voiceRefFile);
      } else if (cloneMode && presetRefStorageId) {
        refStorageId = presetRefStorageId;
      }
      const speakersParam = buildSpeakersParam();
      await createJob({
        type: "audiobook",
        sessionId,
        params: {
          title: title.trim() || "Livre audio",
          text: text.trim(),
          sourceLang,
          targetLang,
          voiceMode: cloneMode ? "keep" : "create",
          cloneVoice: cloneMode,
          ...(instruct ? { instruct } : {}),
          ...(refStorageId ? { refStorageId } : {}),
          ...(speakersParam ? { speakers: speakersParam } : {}),
          speed,
          maxChars: 600,
          voiceConsent: true,
          consentAt: Date.now(),
        },
      });
      setVoiceConsent(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec envoi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Livre audio
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Écris ton texte, assigne une voix à chaque personnage, génère.
        </p>
      </div>

      <form
        onSubmit={onGenerate}
        className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
      >
        <label className="block space-y-2">
          <span className="text-sm font-medium">Titre</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
            placeholder="Titre du livre…"
          />
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium">Manuscrit</span>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
            placeholder={`# Chapitre 1\n\nNarration…\n\nAlice: Bonjour !\nBob: [laughter] Salut.`}
          />
          <div className="flex flex-wrap gap-2">
            {EXPRESS_TAGS.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => insertAtCursor(text, setText, textRef, t.tag)}
                className="min-h-8 rounded-full border border-[var(--line)] bg-white px-2.5 text-[11px] font-medium hover:bg-[var(--bg-subtle)]"
                title={t.tag}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Dialogue :{" "}
            <code className="rounded bg-[var(--bg)] px-1">Nom: réplique</code>
            {" · "}
            {charCount} car. · {chapters.length} segment(s)
            {speakers.length > 0 ? ` · ${speakers.length} personnage(s)` : ""}
          </p>
        </div>

        {chapters.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4 text-[var(--signal)]" aria-hidden />
              Découpe
            </p>
            <ol className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {chapters.slice(0, 20).map((ch, i) => (
                <li key={`${ch.title}-${i}`} className="flex gap-2 py-0.5">
                  <span className="w-5 shrink-0 text-[var(--muted)]">
                    {i + 1}.
                  </span>
                  <span className="min-w-[4.5rem] shrink-0 font-semibold text-[var(--signal)]">
                    {ch.speaker}
                  </span>
                  <span className="truncate text-[var(--muted)]">{ch.text}</span>
                </li>
              ))}
            </ol>
            {chapters.length > 80 && (
              <p className="text-sm text-[var(--danger)]">
                Max 80 segments — regroupe ton texte.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <LangPicker
            label="Langue du manuscrit"
            value={sourceLang}
            onChange={setSourceLang}
          />
          <LangPicker
            label="Langue lue (TTS)"
            value={targetLang}
            onChange={setTargetLang}
          />
        </div>

        {/* Cast — une ligne par rôle, chips voix (ElevenLabs-like) */}
        <fieldset className="space-y-4">
          <legend className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-[var(--signal)]" aria-hidden />
            Voix des personnages
          </legend>
          <p className="text-xs text-[var(--muted)]">
            Clique une voix pour chaque rôle. Les lignes{" "}
            <code className="rounded bg-[var(--bg)] px-1">Nom:</code> du
            manuscrit apparaissent ici automatiquement.
          </p>

          {cloneMode ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--muted)]">
              Mode clone : une seule voix pour tout le livre (narrateur +
              dialogues).
            </p>
          ) : (
            <ul className="space-y-4">
              {castRoles.map((role) => {
                const selected = cast[role] || "";
                const initial = role.slice(0, 1).toUpperCase();
                return (
                  <li key={role} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-bold text-white"
                        aria-hidden
                      >
                        {initial}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{role}</p>
                        <p className="text-[11px] text-[var(--muted)]">
                          → {voiceLabel(selected)}
                          {CAST_VOICES.find((v) => v.id === selected)?.blurb
                            ? ` · ${CAST_VOICES.find((v) => v.id === selected)?.blurb}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-10">
                      {CAST_VOICES.map((v) => {
                        const active = selected === v.id;
                        return (
                          <button
                            key={`${role}-${v.id}`}
                            type="button"
                            onClick={() =>
                              setCast((prev) => ({ ...prev, [role]: v.id }))
                            }
                            className={
                              active
                                ? "min-h-8 rounded-full bg-[var(--ink)] px-3 text-[11px] font-semibold text-white"
                                : "min-h-8 rounded-full border border-[var(--line)] bg-white px-3 text-[11px] font-medium hover:bg-[var(--bg-subtle)]"
                            }
                            title={v.instruct}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
          <input
            type="checkbox"
            checked={cloneMode}
            onChange={(e) => {
              setCloneMode(e.target.checked);
              if (!e.target.checked) setVoiceRefFile(null);
            }}
            className="mt-1 size-4 accent-[var(--ink)]"
          />
          <span className="text-sm leading-snug">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Mic2 className="size-3.5" aria-hidden />
              Cloner ma voix
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              Une seule voix pour tout le livre — désactive le cast multi-voix.
            </span>
          </span>
        </label>

        {cloneMode && (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Échantillon de voix</span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
              onChange={(e) => {
                setVoiceRefFile(e.target.files?.[0] ?? null);
                setPresetRefStorageId(null);
              }}
              className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[var(--ink)] file:px-4 file:text-sm file:font-semibold file:text-white"
            />
            {savedVoices && savedVoices.some((v) => v.kind === "clone") && (
              <div className="flex flex-wrap gap-2">
                {savedVoices
                  .filter((v) => v.kind === "clone" && v.refStorageId)
                  .slice(0, 6)
                  .map((v) => (
                    <button
                      key={v._id}
                      type="button"
                      onClick={() => {
                        setVoiceRefFile(null);
                        setPresetRefStorageId(v.refStorageId!);
                      }}
                      className={
                        presetRefStorageId === v.refStorageId
                          ? "min-h-8 rounded-full bg-[var(--ink)] px-3 text-xs font-semibold text-white"
                          : "min-h-8 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium"
                      }
                    >
                      {v.name}
                    </button>
                  ))}
              </div>
            )}
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium">
            Rythme · {speed.toFixed(2)}×
          </span>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--ink)]"
          />
        </label>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
          <input
            type="checkbox"
            checked={voiceConsent}
            onChange={(e) => setVoiceConsent(e.target.checked)}
            className="mt-1 size-4 accent-[var(--ink)]"
          />
          <span className="text-sm leading-snug">
            Consentement explicite pour les voix utilisées dans ce livre audio.
          </span>
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Sparkles className="size-4" aria-hidden />
            {submitting
              ? "Envoi…"
              : `Générer · ${chapters.length} segment(s)`}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique livres audio</h2>
        <JobList jobs={jobs} loading={jobsLoading} />
      </section>
    </section>
  );
}

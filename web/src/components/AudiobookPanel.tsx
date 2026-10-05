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
import {
  BookOpen,
  Mic2,
  Music2,
  Pencil,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { LangPicker } from "./LangPicker";
import {
  canAutoTranslate,
  langLabel,
  langSupport,
  normalizeLangCode,
  supportHint,
} from "../lib/languages";
import { JobList } from "./JobList";
import { PUBLIC_VOICES } from "../lib/publicVoices";
import {
  detectSpeakers,
  NARRATOR_KEY,
  splitAudiobookText,
  type AudiobookChapter,
} from "../lib/audiobookSplit";

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
};

type CastSlot = {
  /** public voice id OR "clone:<storageId>" OR "upload" */
  voiceKey: string;
  /** local file if user uploads a clone for this role */
  file?: File | null;
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
  if (/a$|ine$|elle$|ette$/i.test(name)) return "amina";
  return "omar";
}

export function AudiobookPanel({ sessionId, jobs, jobsLoading }: Props) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [title, setTitle] = useState("Mon livre audio");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("en");
  const [speed, setSpeed] = useState(1);
  const [cast, setCast] = useState<Record<string, CastSlot>>({
    [NARRATOR_KEY]: { voiceKey: "amina" },
  });
  const [editSegments, setEditSegments] = useState(false);
  const [segments, setSegments] = useState<AudiobookChapter[]>([]);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState(
    "warm african ambient pad, soft percussion, cinematic storytelling",
  );
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const savedVoices = useQuery(
    api.voices.listBySession,
    sessionId ? { sessionId } : "skip",
  );
  const savedClones = useMemo(
    () =>
      (savedVoices ?? []).filter(
        (v) => v.kind === "clone" && !!v.refStorageId,
      ),
    [savedVoices],
  );

  const autoChapters = useMemo(() => splitAudiobookText(text, 600), [text]);
  const speakers = useMemo(() => detectSpeakers(text), [text]);
  const castRoles = useMemo(
    () => [NARRATOR_KEY, ...speakers],
    [speakers],
  );
  const activeSegments = editSegments ? segments : autoChapters;
  const charCount = text.trim().length;

  // Sync auto segments when text changes (unless editing manually)
  useEffect(() => {
    if (!editSegments) setSegments(autoChapters);
  }, [autoChapters, editSegments]);

  useEffect(() => {
    setCast((prev) => {
      const next = { ...prev };
      if (!next[NARRATOR_KEY]) next[NARRATOR_KEY] = { voiceKey: "amina" };
      for (const name of speakers) {
        if (!next[name]) next[name] = { voiceKey: guessVoiceId(name) };
      }
      return next;
    });
  }, [speakers]);

  const narratorSlot = cast[NARRATOR_KEY];
  const narratorPublic = CAST_VOICES.find(
    (v) => v.id === narratorSlot?.voiceKey,
  );
  const instruct = narratorPublic?.instruct || "";

  const src = normalizeLangCode(sourceLang);
  const tgt = normalizeLangCode(targetLang);
  const needsTranslation = src !== tgt;
  const translationOk = !needsTranslation || canAutoTranslate(src, tgt);
  const targetTtsSupport = langSupport(targetLang);

  const canSubmit =
    !!sessionId &&
    charCount > 20 &&
    activeSegments.length > 0 &&
    activeSegments.length <= 80 &&
    activeSegments.every((s) => s.text.trim().length > 0) &&
    !!sourceLang &&
    !!targetLang &&
    translationOk &&
    voiceConsent &&
    (!musicEnabled || musicPrompt.trim().length > 4);

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

  async function buildSpeakersParam(): Promise<
    Record<string, { instruct?: string; refStorageId?: string }>
  > {
    const map: Record<string, { instruct?: string; refStorageId?: string }> =
      {};
    for (const role of castRoles) {
      const slot = cast[role];
      if (!slot) continue;
      const key = slot.voiceKey;
      if (key.startsWith("clone:")) {
        map[role] = { refStorageId: key.slice("clone:".length) };
      } else if (key === "upload" && slot.file) {
        const id = await uploadAudio(slot.file);
        map[role] = { refStorageId: id };
      } else {
        const pub = CAST_VOICES.find((v) => v.id === key);
        if (pub?.instruct) map[role] = { instruct: pub.instruct };
      }
    }
    return map;
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const speakersParam = await buildSpeakersParam();
      const hasAnyClone = Object.values(speakersParam).some(
        (s) => !!s.refStorageId,
      );
      const narratorRef = speakersParam[NARRATOR_KEY]?.refStorageId;
      const narratorInstruct =
        speakersParam[NARRATOR_KEY]?.instruct || instruct;

      await createJob({
        type: "audiobook",
        sessionId,
        params: {
          title: title.trim() || "Livre audio",
          text: text.trim(),
          segments: activeSegments.map((s) => ({
            title: s.title,
            text: s.text.trim(),
            speaker: s.speaker,
          })),
          sourceLang,
          targetLang,
          voiceMode: hasAnyClone && !narratorInstruct ? "keep" : "create",
          cloneVoice: hasAnyClone,
          ...(narratorInstruct ? { instruct: narratorInstruct } : {}),
          ...(narratorRef ? { refStorageId: narratorRef } : {}),
          speakers: speakersParam,
          speed,
          maxChars: 600,
          ...(musicEnabled
            ? {
                musicPrompt: musicPrompt.trim(),
                musicVolume,
              }
            : {}),
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

  function updateSegment(i: number, patch: Partial<AudiobookChapter>) {
    setSegments((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  function removeSegment(i: number) {
    setSegments((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Livre audio
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Cast multi-voix, édition des segments, lit musical — Vague B2.
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
          />
        </label>

        <div className="space-y-2">
          <span className="text-sm font-medium">Manuscrit</span>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
          />
          <div className="flex flex-wrap gap-2">
            {EXPRESS_TAGS.map((t) => (
              <button
                key={t.tag}
                type="button"
                onClick={() => insertAtCursor(text, setText, textRef, t.tag)}
                className="min-h-8 rounded-full border border-[var(--line)] bg-white px-2.5 text-[11px] font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            <code className="rounded bg-[var(--bg)] px-1">Nom: réplique</code>
            {" · "}
            {charCount} car. · {activeSegments.length} segment(s)
          </p>
        </div>

        {/* Segments éditables */}
        <fieldset className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4 text-[var(--signal)]" aria-hidden />
              Segments ({activeSegments.length})
            </legend>
            <button
              type="button"
              onClick={() => {
                if (!editSegments) {
                  setSegments(autoChapters);
                  setEditSegments(true);
                } else {
                  setEditSegments(false);
                }
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
            >
              <Pencil className="size-3.5" aria-hidden />
              {editSegments ? "Revenir à l’auto" : "Éditer avant envoi"}
            </button>
          </div>

          {!editSegments ? (
            <ol className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {activeSegments.slice(0, 16).map((ch, i) => (
                <li key={`${ch.title}-${i}`} className="flex gap-2 py-0.5">
                  <span className="w-5 text-[var(--muted)]">{i + 1}.</span>
                  <span className="min-w-[4.5rem] font-semibold text-[var(--signal)]">
                    {ch.speaker}
                  </span>
                  <span className="truncate text-[var(--muted)]">{ch.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="max-h-80 space-y-3 overflow-y-auto">
              {segments.map((ch, i) => (
                <li
                  key={`edit-${i}`}
                  className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">{i + 1}</span>
                    <input
                      value={ch.speaker}
                      onChange={(e) =>
                        updateSegment(i, { speaker: e.target.value })
                      }
                      className="min-h-9 w-28 rounded-lg border border-[var(--line)] bg-white px-2 text-xs font-semibold"
                      title="Personnage"
                    />
                    <input
                      value={ch.title}
                      onChange={(e) =>
                        updateSegment(i, { title: e.target.value })
                      }
                      className="min-h-9 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-2 text-xs"
                      title="Titre"
                    />
                    <button
                      type="button"
                      onClick={() => removeSegment(i)}
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--danger)]"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={ch.text}
                    onChange={(e) =>
                      updateSegment(i, { text: e.target.value })
                    }
                    rows={2}
                    className="w-full resize-y rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 font-mono text-xs"
                  />
                </li>
              ))}
            </ul>
          )}
          {activeSegments.length > 80 && (
            <p className="text-sm text-[var(--danger)]">Max 80 segments.</p>
          )}
        </fieldset>

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
        {needsTranslation && !translationOk && (
          <p className="rounded-xl border border-[var(--danger)]/30 bg-red-50 px-3 py-2 text-xs text-[var(--danger)]">
            Traduction NLLB indisponible pour{" "}
            <strong>
              {langLabel(sourceLang)} → {langLabel(targetLang)}
            </strong>
            . Choisissez une langue du catalogue atelier ou la même langue
            source/cible.
          </p>
        )}
        {needsTranslation && translationOk && (
          <p className="text-xs text-[var(--muted)]">
            Traduction auto NLLB · lecture en {langLabel(targetLang)} (
            {supportHint(targetTtsSupport)}).
          </p>
        )}
        {!needsTranslation && (
          <p className="text-xs text-[var(--muted)]">
            Pas de traduction — lecture directe en {langLabel(targetLang)} (
            {supportHint(targetTtsSupport)}).
          </p>
        )}
        {targetTtsSupport === "off" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Langue TTS hors catalogue OmniVoice — le worker tentera un mode
            agnostique (qualité variable).
          </p>
        )}

        {/* Cast + clone par personnage */}
        <fieldset className="space-y-4">
          <legend className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-[var(--signal)]" aria-hidden />
            Voix des personnages
          </legend>
          <p className="text-xs text-[var(--muted)]">
            Voix publique ou clone (échantillon) par rôle — comme ElevenLabs.
          </p>
          <ul className="space-y-4">
            {castRoles.map((role) => {
              const slot = cast[role] ?? { voiceKey: guessVoiceId(role) };
              const initial = role.slice(0, 1).toUpperCase();
              return (
                <li key={role} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-bold text-white">
                      {initial}
                    </span>
                    <p className="text-sm font-semibold">{role}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {CAST_VOICES.map((v) => {
                      const active = slot.voiceKey === v.id;
                      return (
                        <button
                          key={`${role}-${v.id}`}
                          type="button"
                          onClick={() =>
                            setCast((prev) => ({
                              ...prev,
                              [role]: { voiceKey: v.id },
                            }))
                          }
                          className={
                            active
                              ? "min-h-8 rounded-full bg-[var(--ink)] px-3 text-[11px] font-semibold text-white"
                              : "min-h-8 rounded-full border border-[var(--line)] bg-white px-3 text-[11px] font-medium hover:bg-[var(--bg-subtle)]"
                          }
                        >
                          {v.name}
                        </button>
                      );
                    })}
                    {savedClones.map((v) => {
                      const key = `clone:${v.refStorageId}`;
                      const active = slot.voiceKey === key;
                      return (
                        <button
                          key={`${role}-${v._id}`}
                          type="button"
                          onClick={() =>
                            setCast((prev) => ({
                              ...prev,
                              [role]: { voiceKey: key },
                            }))
                          }
                          className={
                            active
                              ? "min-h-8 rounded-full bg-[var(--signal)] px-3 text-[11px] font-semibold text-white"
                              : "min-h-8 rounded-full border border-dashed border-[var(--line)] bg-white px-3 text-[11px] font-medium"
                          }
                          title="Clone enregistré"
                        >
                          <Mic2 className="mr-1 inline size-3" />
                          {v.name}
                        </button>
                      );
                    })}
                    <label
                      className={
                        slot.voiceKey === "upload"
                          ? "inline-flex min-h-8 cursor-pointer items-center rounded-full bg-[var(--signal)] px-3 text-[11px] font-semibold text-white"
                          : "inline-flex min-h-8 cursor-pointer items-center rounded-full border border-dashed border-[var(--line)] bg-white px-3 text-[11px] font-medium"
                      }
                    >
                      <Mic2 className="mr-1 size-3" />
                      Upload
                      <input
                        type="file"
                        accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setCast((prev) => ({
                            ...prev,
                            [role]: { voiceKey: "upload", file: f },
                          }));
                        }}
                      />
                    </label>
                  </div>
                  {slot.voiceKey === "upload" && slot.file && (
                    <p className="pl-10 text-[11px] text-[var(--signal)]">
                      {slot.file.name}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* Lit musique */}
        <fieldset className="space-y-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
            <input
              type="checkbox"
              checked={musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
              className="mt-1 size-4 accent-[var(--ink)]"
            />
            <span className="text-sm leading-snug">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Music2 className="size-3.5" aria-hidden />
                Lit musical sous la narration
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                ACE-Step instrumental, mixé sous la voix (B2).
              </span>
            </span>
          </label>
          {musicEnabled && (
            <div className="space-y-3 pl-1">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--muted)]">
                  Ambiance
                </span>
                <input
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--muted)]">
                  Volume lit · {musicVolume.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={0.4}
                  step={0.01}
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--ink)]"
                />
              </label>
            </div>
          )}
        </fieldset>

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
            Consentement explicite pour les voix / clones de ce livre audio.
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
              : `Générer · ${activeSegments.length} segment(s)`}
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique livres audio</h2>
        <p className="text-xs text-[var(--muted)]">
          Si le worker redémarre, un job en cours reprend au dernier segment
          (checkpoint B2).
        </p>
        <JobList jobs={jobs} loading={jobsLoading} />
      </section>
    </section>
  );
}

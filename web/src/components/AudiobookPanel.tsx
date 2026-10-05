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
  Globe2,
  Mic2,
  Music2,
  Pencil,
  Settings2,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { LangPicker } from "./LangPicker";
import {
  allowPublicDesignVoice,
  audiobookModeBadge,
  audiobookVoiceMode,
  canAutoTranslate,
  langLabel,
  langSupport,
  normalizeLangCode,
  supportHint,
  voicePolicyHint,
} from "../lib/languages";
import { JobList } from "./JobList";
import { PUBLIC_VOICES } from "../lib/publicVoices";
import {
  detectSpeakers,
  NARRATOR_KEY,
  splitAudiobookText,
  type AudiobookChapter,
} from "../lib/audiobookSplit";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
};

type CastSlot = {
  voiceKey: string;
  file?: File | null;
};

type SheetId = "lang" | "cast" | "segments" | "options" | null;

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

function guessVoiceId(name: string, allowDesign: boolean): string {
  if (!allowDesign) return "auto";
  const low = name.toLowerCase();
  const exact = CAST_VOICES.find((v) => v.name.toLowerCase() === low);
  if (exact) return exact.id;
  if (low.includes("amin")) return "amina";
  if (low.includes("omar") || low.includes("ibrah")) return "omar";
  if (low.includes("fatou") || low.includes("mari")) return "fatou";
  if (/a$|ine$|elle$|ette$/i.test(name)) return "amina";
  return "omar";
}

function voiceLabel(slot: CastSlot | undefined, allowDesign: boolean): string {
  if (!slot) return "Auto";
  const key = slot.voiceKey;
  if (key === "auto") return "Auto";
  if (key === "upload") return slot.file ? slot.file.name : "Upload";
  if (key.startsWith("clone:")) return "Clone";
  if (allowDesign) {
    const pub = CAST_VOICES.find((v) => v.id === key);
    if (pub) return pub.name;
  }
  return "Auto";
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
  const [openSheet, setOpenSheet] = useState<SheetId>(null);

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

  const allowDesign = allowPublicDesignVoice(targetLang);
  const voiceMode = audiobookVoiceMode(targetLang);
  const singleVoice = voiceMode === "single";
  const policyHint = voicePolicyHint(targetLang);

  /** Une seule voix partagée pour tout le livre (mode single). */
  const bookVoice = cast[NARRATOR_KEY] ?? { voiceKey: "auto" };

  const autoChapters = useMemo(() => splitAudiobookText(text, 600), [text]);
  const speakers = useMemo(() => detectSpeakers(text), [text]);
  const castRoles = useMemo(
    () => [NARRATOR_KEY, ...speakers],
    [speakers],
  );
  const activeSegments = editSegments ? segments : autoChapters;
  const charCount = text.trim().length;

  useEffect(() => {
    if (!editSegments) setSegments(autoChapters);
  }, [autoChapters, editSegments]);

  useEffect(() => {
    setCast((prev) => {
      const next = { ...prev };
      const defaultKey = allowDesign ? "amina" : "auto";
      if (!next[NARRATOR_KEY]) next[NARRATOR_KEY] = { voiceKey: defaultKey };
      for (const name of speakers) {
        if (!next[name]) {
          next[name] = { voiceKey: guessVoiceId(name, allowDesign) };
        }
      }
      if (!allowDesign) {
        // Une seule voix pour tous les rôles
        const shared = next[NARRATOR_KEY] ?? { voiceKey: "auto" };
        let key = shared.voiceKey;
        if (
          key !== "auto" &&
          key !== "upload" &&
          !key.startsWith("clone:")
        ) {
          key = "auto";
        }
        const slot: CastSlot = {
          voiceKey: key,
          ...(key === "upload" && shared.file ? { file: shared.file } : {}),
        };
        next[NARRATOR_KEY] = slot;
        for (const name of speakers) {
          next[name] = { ...slot };
        }
      }
      return next;
    });
  }, [speakers, allowDesign]);

  function setBookVoice(slot: CastSlot) {
    setCast((prev) => {
      const next = { ...prev };
      next[NARRATOR_KEY] = slot;
      for (const role of castRoles) {
        next[role] = { ...slot };
      }
      return next;
    });
  }

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
    Record<string, { instruct?: string; refStorageId?: string; auto?: boolean }>
  > {
    const map: Record<
      string,
      { instruct?: string; refStorageId?: string; auto?: boolean }
    > = {};

    // Mode 1 voix : même config pour tous les personnages
    if (singleVoice) {
      const slot = bookVoice;
      const key = slot.voiceKey;
      let shared: { instruct?: string; refStorageId?: string; auto?: boolean };
      if (key.startsWith("clone:")) {
        shared = { refStorageId: key.slice("clone:".length) };
      } else if (key === "upload" && slot.file) {
        shared = { refStorageId: await uploadAudio(slot.file) };
      } else {
        shared = { auto: true };
      }
      for (const role of castRoles) {
        map[role] = { ...shared };
      }
      return map;
    }

    for (const role of castRoles) {
      const slot = cast[role];
      if (!slot) continue;
      const key = slot.voiceKey;
      if (key.startsWith("clone:")) {
        map[role] = { refStorageId: key.slice("clone:".length) };
      } else if (key === "upload" && slot.file) {
        const id = await uploadAudio(slot.file);
        map[role] = { refStorageId: id };
      } else if (key === "auto" || !allowDesign) {
        map[role] = { auto: true };
      } else {
        const pub = CAST_VOICES.find((v) => v.id === key);
        if (pub?.instruct) map[role] = { instruct: pub.instruct };
        else map[role] = { auto: true };
      }
    }
    return map;
  }

  async function onGenerate(e?: FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const speakersParam = await buildSpeakersParam();
      const hasAnyClone = Object.values(speakersParam).some(
        (s) => !!s.refStorageId,
      );
      const narratorRef = speakersParam[NARRATOR_KEY]?.refStorageId;
      const narratorInstruct = allowDesign
        ? speakersParam[NARRATOR_KEY]?.instruct
        : undefined;

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
      setOpenSheet(null);
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

  function renderCastRole(role: string) {
    const slot = cast[role] ?? {
      voiceKey: guessVoiceId(role, allowDesign),
    };
    const initial = role.slice(0, 1).toUpperCase();
    return (
      <li key={role} className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-bold text-white">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{role}</p>
            <p className="text-xs text-[var(--muted)]">
              {voiceLabel(slot, allowDesign)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              setCast((prev) => ({
                ...prev,
                [role]: { voiceKey: "auto" },
              }))
            }
            className={
              slot.voiceKey === "auto"
                ? "min-h-9 rounded-full bg-[var(--ink)] px-3 text-xs font-semibold text-white"
                : "min-h-9 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium"
            }
          >
            Auto
          </button>
          {allowDesign &&
            CAST_VOICES.map((v) => {
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
                      ? "min-h-9 rounded-full bg-[var(--ink)] px-3 text-xs font-semibold text-white"
                      : "min-h-9 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium"
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
                    ? "min-h-9 rounded-full bg-[var(--signal)] px-3 text-xs font-semibold text-white"
                    : "min-h-9 rounded-full border border-dashed border-[var(--line)] bg-white px-3 text-xs font-medium"
                }
              >
                <Mic2 className="mr-1 inline size-3" />
                {v.name}
              </button>
            );
          })}
          <label
            className={
              slot.voiceKey === "upload"
                ? "inline-flex min-h-9 cursor-pointer items-center rounded-full bg-[var(--signal)] px-3 text-xs font-semibold text-white"
                : "inline-flex min-h-9 cursor-pointer items-center rounded-full border border-dashed border-[var(--line)] bg-white px-3 text-xs font-medium"
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
      </li>
    );
  }

  return (
    <section className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Livre audio
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          FR / EN / ES / DE… = cast multi-voix. Wolof, Swahili… = 1 voix.
          Le rendu prêt s’affiche dans la scène.
        </p>
      </div>

      <form onSubmit={onGenerate} className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Titre</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
            />
          </label>

          <div className="mt-4 space-y-2">
            <span className="text-sm font-medium">Manuscrit</span>
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
            />
            <div className="flex flex-wrap gap-2">
              {EXPRESS_TAGS.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => insertAtCursor(text, setText, textRef, t.tag)}
                  className="min-h-9 rounded-full border border-[var(--line)] bg-white px-2.5 text-[11px] font-medium hover:bg-[var(--bg-subtle)]"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">
              <code className="rounded bg-[var(--bg)] px-1">Nom: réplique</code>
              {" · "}
              {charCount} car. · {activeSegments.length} segment(s)
              {singleVoice
                ? " · 1 voix pour tout le livre"
                : ` · ${castRoles.length} voix`}
            </p>
          </div>
        </div>

        {/* Barre résumé + accès panneaux */}
        <div className="flex flex-wrap gap-2">
          <Sheet
            open={openSheet === "lang"}
            onOpenChange={(o) => setOpenSheet(o ? "lang" : null)}
          >
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Globe2 className="size-4" aria-hidden />
                {langLabel(sourceLang)} → {langLabel(targetLang)}
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Langues</SheetTitle>
                <SheetDescription>
                  Manuscrit et langue lue (TTS + traduction NLLB).
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <LangPicker
                  label="Langue du manuscrit"
                  value={sourceLang}
                  onChange={setSourceLang}
                />
                <LangPicker
                  label="Langue lue (TTS)"
                  value={targetLang}
                  onChange={setTargetLang}
                  variant="tts"
                />
                <div
                  className={
                    singleVoice
                      ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
                      : "rounded-xl border border-[var(--signal)]/25 bg-[var(--bg-subtle)] px-3 py-2.5 text-xs text-[var(--ink)]"
                  }
                >
                  <p className="font-semibold">
                    {audiobookModeBadge(targetLang)} · {langLabel(targetLang)}
                  </p>
                  <p className="mt-1 leading-relaxed opacity-90">{policyHint}</p>
                </div>
                {needsTranslation && !translationOk && (
                  <p className="rounded-xl border border-[var(--danger)]/30 bg-red-50 px-3 py-2 text-xs text-[var(--danger)]">
                    Traduction NLLB indisponible pour{" "}
                    <strong>
                      {langLabel(sourceLang)} → {langLabel(targetLang)}
                    </strong>
                    .
                  </p>
                )}
                {needsTranslation && translationOk && (
                  <p className="text-xs text-[var(--muted)]">
                    Traduction auto · lecture en {langLabel(targetLang)} (
                    {supportHint(targetTtsSupport)}).
                  </p>
                )}
                {!needsTranslation && (
                  <p className="text-xs text-[var(--muted)]">
                    Pas de traduction — {langLabel(targetLang)} (
                    {supportHint(targetTtsSupport)}).
                  </p>
                )}
              </SheetBody>
              <SheetFooter>
                <Button type="button" onClick={() => setOpenSheet(null)}>
                  OK
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet
            open={openSheet === "cast"}
            onOpenChange={(o) => setOpenSheet(o ? "cast" : null)}
          >
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Users className="size-4" aria-hidden />
                {singleVoice
                  ? `Voix · ${voiceLabel(bookVoice, false)}`
                  : `Cast · ${castRoles.length}`}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="max-w-lg">
              <SheetHeader>
                <SheetTitle>
                  {singleVoice ? "Une voix pour le livre" : "Voix du cast"}
                </SheetTitle>
                <SheetDescription>
                  {singleVoice
                    ? "Tous les personnages sont lus avec la même voix. Pas besoin de 3 clones."
                    : "Choisis une voix publique (ou un clone) par personnage."}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                {singleVoice ? (
                  <>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                      {policyHint}
                    </div>
                    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
                      <p className="text-sm font-semibold">
                        Voix · {voiceLabel(bookVoice, false)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBookVoice({ voiceKey: "auto" })}
                          className={
                            bookVoice.voiceKey === "auto"
                              ? "min-h-10 rounded-full bg-[var(--ink)] px-4 text-xs font-semibold text-white"
                              : "min-h-10 rounded-full border border-[var(--line)] bg-white px-4 text-xs font-medium"
                          }
                        >
                          Auto (recommandé)
                        </button>
                        {savedClones.map((v) => {
                          const key = `clone:${v.refStorageId}`;
                          const active = bookVoice.voiceKey === key;
                          return (
                            <button
                              key={v._id}
                              type="button"
                              onClick={() => setBookVoice({ voiceKey: key })}
                              className={
                                active
                                  ? "min-h-10 rounded-full bg-[var(--signal)] px-4 text-xs font-semibold text-white"
                                  : "min-h-10 rounded-full border border-dashed border-[var(--line)] bg-white px-4 text-xs font-medium"
                              }
                            >
                              <Mic2 className="mr-1 inline size-3" />
                              {v.name}
                            </button>
                          );
                        })}
                        <label
                          className={
                            bookVoice.voiceKey === "upload"
                              ? "inline-flex min-h-10 cursor-pointer items-center rounded-full bg-[var(--signal)] px-4 text-xs font-semibold text-white"
                              : "inline-flex min-h-10 cursor-pointer items-center rounded-full border border-dashed border-[var(--line)] bg-white px-4 text-xs font-medium"
                          }
                        >
                          <Mic2 className="mr-1 size-3" />
                          1 échantillon
                          <input
                            type="file"
                            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setBookVoice({ voiceKey: "upload", file: f });
                            }}
                          />
                        </label>
                      </div>
                      {bookVoice.voiceKey === "upload" && bookVoice.file && (
                        <p className="text-[11px] text-[var(--signal)]">
                          {bookVoice.file.name}
                        </p>
                      )}
                    </div>
                    {speakers.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-[var(--muted)]">
                          Personnages détectés (même voix)
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {castRoles.map((role) => (
                            <li
                              key={role}
                              className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-xs"
                            >
                              {role}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <ul className="space-y-3">
                    {castRoles.map(renderCastRole)}
                  </ul>
                )}
              </SheetBody>
              <SheetFooter>
                <Button type="button" onClick={() => setOpenSheet(null)}>
                  OK
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet
            open={openSheet === "segments"}
            onOpenChange={(o) => setOpenSheet(o ? "segments" : null)}
          >
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <BookOpen className="size-4" aria-hidden />
                Segments · {activeSegments.length}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="max-w-lg">
              <SheetHeader>
                <div className="flex items-center justify-between gap-2 pr-8">
                  <SheetTitle>Segments</SheetTitle>
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
                    {editSegments ? "Auto" : "Éditer"}
                  </button>
                </div>
                <SheetDescription>
                  Découpe automatique du manuscrit avant génération.
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                {!editSegments ? (
                  <ol className="space-y-2 text-xs">
                    {activeSegments.map((ch, i) => (
                      <li
                        key={`${ch.title}-${i}`}
                        className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2"
                      >
                        <div className="flex gap-2">
                          <span className="text-[var(--muted)]">{i + 1}.</span>
                          <span className="font-semibold text-[var(--signal)]">
                            {ch.speaker}
                          </span>
                        </div>
                        <p className="mt-1 text-[var(--muted)]">{ch.text}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ul className="space-y-3">
                    {segments.map((ch, i) => (
                      <li
                        key={`edit-${i}`}
                        className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--muted)]">
                            {i + 1}
                          </span>
                          <input
                            value={ch.speaker}
                            onChange={(e) =>
                              updateSegment(i, { speaker: e.target.value })
                            }
                            className="min-h-9 w-28 rounded-lg border border-[var(--line)] bg-white px-2 text-xs font-semibold"
                          />
                          <input
                            value={ch.title}
                            onChange={(e) =>
                              updateSegment(i, { title: e.target.value })
                            }
                            className="min-h-9 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-2 text-xs"
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
                  <p className="mt-3 text-sm text-[var(--danger)]">
                    Max 80 segments.
                  </p>
                )}
              </SheetBody>
              <SheetFooter>
                <Button type="button" onClick={() => setOpenSheet(null)}>
                  OK
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet
            open={openSheet === "options"}
            onOpenChange={(o) => setOpenSheet(o ? "options" : null)}
          >
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Settings2 className="size-4" aria-hidden />
                Options
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Options</SheetTitle>
                <SheetDescription>
                  Rythme et lit musical.
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-5">
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
                        Lit musical
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        ACE-Step instrumental sous la narration.
                      </span>
                    </span>
                  </label>
                  {musicEnabled && (
                    <div className="space-y-3">
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
                          Volume · {musicVolume.toFixed(2)}
                        </span>
                        <input
                          type="range"
                          min={0.05}
                          max={0.4}
                          step={0.01}
                          value={musicVolume}
                          onChange={(e) =>
                            setMusicVolume(Number(e.target.value))
                          }
                          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--ink)]"
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
              </SheetBody>
              <SheetFooter>
                <Button type="button" onClick={() => setOpenSheet(null)}>
                  OK
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Badge tone={singleVoice ? "muted" : "ok"}>
            {audiobookModeBadge(targetLang)}
          </Badge>
        </div>

        {/* Consentement toujours visible (pas dans un sheet) */}
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow)]">
          <input
            type="checkbox"
            checked={voiceConsent}
            onChange={(e) => setVoiceConsent(e.target.checked)}
            className="mt-1 size-4 accent-[var(--ink)]"
          />
          <span className="text-sm leading-snug text-[var(--ink)]">
            Je confirme le{" "}
            <strong className="font-semibold">consentement explicite</strong>{" "}
            pour les voix / clones de ce livre audio.
            {!voiceConsent && (
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Requis pour générer.
              </span>
            )}
          </span>
        </label>
      </form>

      {/* Barre d'action sticky */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg-elevated)]/95 px-4 py-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="flex w-full items-center justify-between gap-3">
          <p className="hidden text-xs text-[var(--muted)] sm:block">
            {activeSegments.length} segment(s) · {langLabel(targetLang)} ·{" "}
            {audiobookModeBadge(targetLang)}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit || submitting}
            onClick={() => void onGenerate()}
            className="w-full sm:w-auto"
          >
            <Sparkles className="size-4" aria-hidden />
            {submitting
              ? "Envoi…"
              : `Générer · ${activeSegments.length} segment(s)`}
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique</h2>
        <p className="text-xs text-[var(--muted)]">
          Reprise au dernier segment si le worker redémarre (checkpoint B2).
        </p>
        <JobList jobs={jobs} loading={jobsLoading} />
      </section>
    </section>
  );
}

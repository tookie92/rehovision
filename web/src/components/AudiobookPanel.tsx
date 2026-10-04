"use client";

import {
  FormEvent,
  RefObject,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AudioLines,
  BookOpen,
  Mic2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { LangPicker } from "./LangPicker";
import { JobList } from "./JobList";
import { PUBLIC_VOICES } from "../lib/publicVoices";
import {
  detectSpeakers,
  NARRATOR_KEY,
  splitAudiobookText,
} from "../lib/audiobookSplit";

type VoiceMode = "keep" | "model" | "create";

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
};

const GENDER = [
  { id: "male", label: "Homme" },
  { id: "female", label: "Femme" },
] as const;

const AGE = [
  { id: "child", label: "Enfant" },
  { id: "teenager", label: "Ado" },
  { id: "young adult", label: "Jeune" },
  { id: "middle-aged", label: "Adulte" },
  { id: "elderly", label: "Aîné" },
] as const;

const PITCH = [
  { id: "very low pitch", label: "Très grave" },
  { id: "low pitch", label: "Grave" },
  { id: "moderate pitch", label: "Médium" },
  { id: "high pitch", label: "Aigu" },
  { id: "very high pitch", label: "Très aigu" },
] as const;

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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-9 rounded-full bg-[var(--ink)] px-3 text-xs font-semibold text-white"
          : "min-h-9 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
      }
    >
      {children}
    </button>
  );
}

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

export function AudiobookPanel({ sessionId, jobs, jobsLoading }: Props) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [title, setTitle] = useState("Mon livre audio");
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("en");
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("create");
  const [gender, setGender] = useState("female");
  const [age, setAge] = useState("young adult");
  const [pitch, setPitch] = useState("moderate pitch");
  const [speed, setSpeed] = useState(1);
  const [voiceRefFile, setVoiceRefFile] = useState<File | null>(null);
  const [presetRefStorageId, setPresetRefStorageId] = useState<
    Id<"_storage"> | null
  >(null);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(
    "amina",
  );
  /** speaker → public voice id (empty = voix par défaut / narrateur) */
  const [speakerVoiceIds, setSpeakerVoiceIds] = useState<
    Record<string, string>
  >({});
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const savedVoices = useQuery(
    api.voices.listBySession,
    sessionId ? { sessionId } : "skip",
  );

  const instruct = useMemo(() => {
    if (voiceMode !== "create") return "";
    return [gender, age, pitch].filter(Boolean).join(", ");
  }, [voiceMode, gender, age, pitch]);

  const chapters = useMemo(() => splitAudiobookText(text, 600), [text]);
  const speakers = useMemo(() => detectSpeakers(text), [text]);
  const charCount = text.trim().length;
  const multiVoice = speakers.length > 0 && voiceMode !== "keep";

  const canSubmit =
    !!sessionId &&
    charCount > 20 &&
    chapters.length > 0 &&
    chapters.length <= 80 &&
    !!sourceLang &&
    !!targetLang &&
    voiceConsent &&
    !(voiceMode === "create" && !instruct) &&
    !(voiceMode === "keep" && !voiceRefFile && !presetRefStorageId);

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

  function applyPublic(id: string) {
    const v = PUBLIC_VOICES.find((x) => x.id === id);
    if (!v) return;
    setSelectedPublicId(id);
    if (!v.instruct) {
      setVoiceMode("model");
      return;
    }
    setVoiceMode("create");
    setGender(v.gender || "female");
    setAge(v.age || "young adult");
    setPitch(v.pitch || "moderate pitch");
  }

  function buildSpeakersParam(): Record<string, { instruct: string }> | undefined {
    if (!multiVoice) return undefined;
    const map: Record<string, { instruct: string }> = {};
    if (instruct) {
      map[NARRATOR_KEY] = { instruct };
    }
    for (const name of speakers) {
      const vid = speakerVoiceIds[name];
      const pub = vid ? PUBLIC_VOICES.find((v) => v.id === vid) : null;
      if (pub?.instruct) {
        map[name] = { instruct: pub.instruct };
      } else if (instruct) {
        map[name] = { instruct };
      }
    }
    return Object.keys(map).length ? map : undefined;
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let refStorageId: string | undefined;
      if (voiceMode === "keep" && voiceRefFile) {
        refStorageId = await uploadAudio(voiceRefFile);
      } else if (voiceMode === "keep" && presetRefStorageId) {
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
          voiceMode,
          cloneVoice: voiceMode === "keep",
          ...(voiceMode === "create" && instruct ? { instruct } : {}),
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
          Chapitres, dialogues multi-voix et tags OmniVoice — une lecture
          segment par segment.
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
                onClick={() =>
                  insertAtCursor(text, setText, textRef, t.tag)
                }
                className="min-h-8 rounded-full border border-[var(--line)] bg-white px-2.5 text-[11px] font-medium text-[var(--ink)] hover:bg-[var(--bg-subtle)]"
                title={t.tag}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Dialogues :{" "}
            <code className="rounded bg-[var(--bg)] px-1">Nom: réplique</code>
            {" · "}
            tags natifs OmniVoice · {charCount} car. · {chapters.length}{" "}
            segment(s)
            {speakers.length > 0 ? ` · ${speakers.length} personnage(s)` : ""}
          </p>
        </div>

        {chapters.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4 text-[var(--signal)]" aria-hidden />
              Découpe prévue
            </p>
            <ol className="max-h-52 space-y-1.5 overflow-y-auto text-xs">
              {chapters.slice(0, 28).map((ch, i) => (
                <li
                  key={`${ch.title}-${i}`}
                  className="flex gap-2 border-b border-[var(--line)]/60 pb-1.5 last:border-0"
                >
                  <span className="w-5 shrink-0 text-[var(--muted)]">
                    {i + 1}.
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {ch.speaker !== NARRATOR_KEY ? (
                        <span className="text-[var(--signal)]">
                          {ch.speaker}
                        </span>
                      ) : (
                        ch.title
                      )}
                      {ch.speaker !== NARRATOR_KEY && (
                        <span className="font-normal text-[var(--muted)]">
                          {" "}
                          · {ch.title}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[var(--muted)]">
                      {ch.text}
                    </span>
                  </span>
                  <span className="shrink-0 text-[var(--muted)]">
                    {ch.text.length}
                  </span>
                </li>
              ))}
            </ol>
            {chapters.length > 28 && (
              <p className="text-xs text-[var(--muted)]">
                +{chapters.length - 28} autres segments…
              </p>
            )}
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

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Voix par défaut (narrateur)
          </legend>
          <div className="flex flex-wrap gap-2">
            {PUBLIC_VOICES.slice(0, 8).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => applyPublic(v.id)}
                className={
                  selectedPublicId === v.id
                    ? "min-h-9 rounded-full bg-[var(--ink)] px-3 text-xs font-semibold text-white"
                    : "min-h-9 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                }
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>

        {savedVoices && savedVoices.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Mes voix</legend>
            <div className="flex flex-wrap gap-2">
              {savedVoices.slice(0, 8).map((v) => (
                <button
                  key={v._id}
                  type="button"
                  onClick={() => {
                    setSelectedPublicId(null);
                    if (v.kind === "design" && v.instruct) {
                      setVoiceMode("create");
                      setPresetRefStorageId(null);
                      if (v.gender) setGender(v.gender);
                      if (v.age) setAge(v.age);
                      if (v.pitch) setPitch(v.pitch);
                      if (typeof v.speed === "number") setSpeed(v.speed);
                    } else if (v.kind === "clone" && v.refStorageId) {
                      setVoiceMode("keep");
                      setVoiceRefFile(null);
                      setPresetRefStorageId(v.refStorageId);
                      if (typeof v.speed === "number") setSpeed(v.speed);
                    }
                  }}
                  className="min-h-9 rounded-full border border-[var(--line)] bg-white px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                >
                  {v.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mode voix</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["keep", "Ma voix", Mic2],
                ["model", "Modèle", AudioLines],
                ["create", "Créer", Wand2],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setVoiceMode(id);
                  setSelectedPublicId(null);
                }}
                className={
                  voiceMode === id
                    ? "flex min-h-12 items-center gap-2 rounded-xl bg-[var(--ink)] px-3 text-sm font-semibold text-white"
                    : "flex min-h-12 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          {voiceMode === "keep" && speakers.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              Clone = une seule voix pour tout le livre (y compris les
              dialogues). Passe en « Créer » pour assigner une voix par
              personnage.
            </p>
          )}
        </fieldset>

        {voiceMode === "create" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {GENDER.map((g) => (
                <Chip
                  key={g.id}
                  active={gender === g.id}
                  onClick={() => setGender(g.id)}
                >
                  {g.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {AGE.map((a) => (
                <Chip
                  key={a.id}
                  active={age === a.id}
                  onClick={() => setAge(a.id)}
                >
                  {a.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PITCH.map((p) => (
                <Chip
                  key={p.id}
                  active={pitch === p.id}
                  onClick={() => setPitch(p.id)}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
            <p className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--signal)]">
              {instruct || "—"}
            </p>
          </div>
        )}

        {multiVoice && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Voix des personnages
            </legend>
            <p className="text-xs text-[var(--muted)]">
              Narrateur = voix par défaut ci-dessus. Choisis une voix publique
              pour chaque nom détecté.
            </p>
            <ul className="space-y-2">
              {speakers.map((name) => (
                <li
                  key={name}
                  className="flex flex-wrap items-center gap-2 sm:gap-3"
                >
                  <span className="min-w-[5.5rem] text-sm font-semibold text-[var(--signal)]">
                    {name}
                  </span>
                  <select
                    value={speakerVoiceIds[name] || ""}
                    onChange={(e) =>
                      setSpeakerVoiceIds((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    className="min-h-10 min-w-[12rem] flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                  >
                    <option value="">Comme le narrateur</option>
                    {PUBLIC_VOICES.filter((v) => v.instruct).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} — {v.blurb}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {voiceMode === "keep" && (
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
            {!voiceRefFile && presetRefStorageId && (
              <span className="text-xs text-[var(--signal)]">
                Échantillon du preset sélectionné
              </span>
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
            Consentement explicite pour la voix / clonage utilisés dans ce livre
            audio.
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

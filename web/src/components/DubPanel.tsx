"use client";

import { useMutation, useQuery } from "convex/react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookmarkPlus,
  Gauge,
  Mic2,
  Play,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { LangPicker } from "./LangPicker";
import { JobList } from "./JobList";
import { PUBLIC_VOICES, type PublicVoice } from "../lib/publicVoices";
import type { Doc, Id } from "@convex/_generated/dataModel";

type DubMode = "narration" | "doublage";
type VoiceMode = "keep" | "model" | "create";
type Step = 1 | 2 | 3;

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

const ACCENTS = [
  { id: "american accent", label: "Américain" },
  { id: "british accent", label: "Britannique" },
  { id: "australian accent", label: "Australien" },
  { id: "canadian accent", label: "Canadien" },
  { id: "indian accent", label: "Indien" },
  { id: "chinese accent", label: "Chinois" },
  { id: "japanese accent", label: "Japonais" },
  { id: "korean accent", label: "Coréen" },
  { id: "portuguese accent", label: "Portugais" },
  { id: "russian accent", label: "Russe" },
] as const;

const SPEED_PRESETS = [
  { id: 0.8, label: "Lente" },
  { id: 1, label: "Naturelle" },
  { id: 1.2, label: "Vive" },
] as const;

/** Tags OmniVoice non-verbaux (pas ElevenLabs emotion tags). */
const EXPRESS_TAGS = [
  { tag: "[laughter]", label: "Rire" },
  { tag: "[sigh]", label: "Soupir" },
  { tag: "[surprise-oh]", label: "Surprise" },
  { tag: "[surprise-ah]", label: "Étonnement" },
  { tag: "[question-en]", label: "Question" },
  { tag: "[confirmation-en]", label: "Hmm" },
  { tag: "[dissatisfaction-hnn]", label: "Mécontent" },
] as const;

function Chip({
  active,
  onClick,
  children,
  size = "md",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-10 px-3.5 text-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? `${pad} rounded-full bg-[var(--ink)] font-semibold text-white transition-colors duration-200`
          : `${pad} rounded-full border border-[var(--line)] bg-white font-medium text-[var(--ink)] transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--bg-subtle)]`
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

function parseInstructChips(instruct: string): {
  gender: string;
  age: string;
  pitch: string;
  accent: string;
  whisper: boolean;
} {
  const parts = instruct
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const genderIds = new Set(GENDER.map((g) => g.id));
  const ageIds = new Set(AGE.map((a) => a.id));
  const pitchIds = new Set(PITCH.map((p) => p.id));
  const accentIds = new Set(ACCENTS.map((a) => a.id));
  let gender = "";
  let age = "";
  let pitch = "";
  let accent = "";
  let whisper = false;
  for (const p of parts) {
    if (genderIds.has(p as (typeof GENDER)[number]["id"])) gender = p;
    else if (ageIds.has(p as (typeof AGE)[number]["id"])) age = p;
    else if (pitchIds.has(p as (typeof PITCH)[number]["id"])) pitch = p;
    else if (accentIds.has(p as (typeof ACCENTS)[number]["id"])) accent = p;
    else if (p === "whisper") whisper = true;
  }
  return { gender, age, pitch, accent, whisper };
}

async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function SaveVoiceBar({
  showForm,
  saveName,
  saving,
  onToggle,
  onName,
  onSave,
  hint,
  previewSlot,
}: {
  showForm: boolean;
  saveName: string;
  saving: boolean;
  onToggle: () => void;
  onName: (v: string) => void;
  onSave: () => void;
  hint: string;
  previewSlot?: ReactNode;
}) {
  if (!showForm) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {previewSlot}
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
        >
          <BookmarkPlus className="size-4 text-[var(--signal)]" aria-hidden />
          {hint}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={saveName}
          onChange={(e) => onName(e.target.value)}
          placeholder="Nom de la voix…"
          maxLength={64}
          className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
        />
        <button
          type="button"
          disabled={saving || !saveName.trim()}
          onClick={onSave}
          className="min-h-11 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "…" : "Sauver"}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-sm"
        >
          Annuler
        </button>
      </div>
      {previewSlot}
    </div>
  );
}

export function DubPanel({ sessionId, jobs, jobsLoading }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [dubMode, setDubMode] = useState<DubMode>("narration");
  const [text, setText] = useState(
    "Bonjour, bienvenue dans notre atelier. Aujourd'hui on parle de création locale.",
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [voiceRefFile, setVoiceRefFile] = useState<File | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("keep");
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("wo");
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [sourceTextSnap, setSourceTextSnap] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Voice Lab
  const [gender, setGender] = useState<string>("female");
  const [age, setAge] = useState<string>("young adult");
  const [pitch, setPitch] = useState<string>("moderate pitch");
  const [accent, setAccent] = useState<string>("");
  const [whisper, setWhisper] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedVoiceId, setSelectedVoiceId] = useState<Id<"voices"> | null>(
    null,
  );
  const [presetRefStorageId, setPresetRefStorageId] = useState<
    Id<"_storage"> | null
  >(null);
  const [saveName, setSaveName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(
    null,
  );
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);

  const spokenRef = useRef<HTMLTextAreaElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const saveVoice = useMutation(api.voices.create);
  const removeVoice = useMutation(api.voices.remove);
  const savedVoices = useQuery(
    api.voices.listBySession,
    sessionId ? { sessionId } : "skip",
  );
  const presetRefUrl = useQuery(
    api.jobs.getFileUrl,
    presetRefStorageId ? { storageId: presetRefStorageId } : "skip",
  );
  const cloneVoice = voiceMode === "keep";
  const showAccents = targetLang === "en" || targetLang.startsWith("en");

  const instruct = useMemo(() => {
    if (voiceMode !== "create") return "";
    const parts: string[] = [];
    if (gender) parts.push(gender);
    if (age) parts.push(age);
    if (pitch) parts.push(pitch);
    if (whisper) parts.push("whisper");
    if (showAccents && accent) parts.push(accent);
    return parts.join(", ");
  }, [voiceMode, gender, age, pitch, whisper, accent, showAccents]);

  useEffect(() => {
    return () => {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    };
  }, [voicePreviewUrl]);

  // Lecture auto une fois le <audio> monté
  useEffect(() => {
    if (!voicePreviewUrl) return;
    const el = previewAudioRef.current;
    if (!el) return;
    el.load();
    void el.play().catch(() => undefined);
  }, [voicePreviewUrl]);

  function clearVoicePreview() {
    setVoicePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVoicePreviewError(null);
  }

  const step1Ok =
    !!sessionId &&
    (dubMode === "narration"
      ? text.trim().length > 0
      : audioFile !== null);

  const step2Ok =
    step1Ok &&
    !!sourceLang &&
    !!targetLang &&
    !(
      cloneVoice &&
      dubMode === "narration" &&
      !voiceRefFile &&
      !audioFile &&
      !presetRefStorageId
    ) &&
    !(voiceMode === "create" && !instruct);

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

  function applySavedVoice(voice: Doc<"voices">) {
    setSelectedVoiceId(voice._id);
    setSelectedPublicId(null);
    clearVoicePreview();
    if (typeof voice.speed === "number" && Number.isFinite(voice.speed)) {
      setSpeed(Math.min(1.3, Math.max(0.7, voice.speed)));
    }
    if (voice.kind === "design") {
      setVoiceMode("create");
      setPresetRefStorageId(null);
      setVoiceRefFile(null);
      if (voice.gender || voice.age || voice.pitch || voice.instruct) {
        const fromInstruct = voice.instruct
          ? parseInstructChips(voice.instruct)
          : {
              gender: "",
              age: "",
              pitch: "",
              accent: "",
              whisper: false,
            };
        setGender(voice.gender || fromInstruct.gender || "female");
        setAge(voice.age || fromInstruct.age || "");
        setPitch(voice.pitch || fromInstruct.pitch || "");
        setAccent(voice.accent || fromInstruct.accent || "");
        setWhisper(voice.whisper ?? fromInstruct.whisper);
      }
      return;
    }
    setVoiceMode("keep");
    setPresetRefStorageId(voice.refStorageId ?? null);
    setVoiceRefFile(null);
  }

  function applyPublicVoice(voice: PublicVoice) {
    setSelectedPublicId(voice.id);
    setSelectedVoiceId(null);
    setPresetRefStorageId(null);
    setVoiceRefFile(null);
    clearVoicePreview();
    if (!voice.instruct) {
      setVoiceMode("model");
      return;
    }
    setVoiceMode("create");
    setGender(voice.gender || "female");
    setAge(voice.age || "");
    setPitch(voice.pitch || "");
    setAccent(voice.accent || "");
    setWhisper(!!voice.whisper);
  }

  async function onSaveVoice() {
    if (!sessionId || !saveName.trim()) return;
    setSavingVoice(true);
    try {
      if (voiceMode === "create") {
        if (!instruct) throw new Error("Compose d’abord une recette");
        const id = await saveVoice({
          sessionId,
          name: saveName.trim(),
          kind: "design",
          instruct,
          gender: gender || undefined,
          age: age || undefined,
          pitch: pitch || undefined,
          accent: showAccents && accent ? accent : undefined,
          whisper,
          speed,
        });
        setSelectedVoiceId(id);
      } else if (voiceMode === "keep") {
        let refId = presetRefStorageId ?? undefined;
        if (voiceRefFile) {
          refId = (await uploadAudio(voiceRefFile)) as Id<"_storage">;
          setPresetRefStorageId(refId);
        }
        if (!refId) {
          throw new Error("Ajoute un échantillon avant de sauvegarder");
        }
        const id = await saveVoice({
          sessionId,
          name: saveName.trim(),
          kind: "clone",
          refStorageId: refId,
          speed,
        });
        setSelectedVoiceId(id);
      } else {
        throw new Error("Sauvegarde dispo pour Créer une voix ou Ma voix");
      }
      setSaveName("");
      setShowSaveForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec sauvegarde voix");
    } finally {
      setSavingVoice(false);
    }
  }

  async function onDeleteVoice(voiceId: Id<"voices">) {
    if (!sessionId) return;
    if (!window.confirm("Supprimer cette voix sauvegardée ?")) return;
    try {
      await removeVoice({ sessionId, voiceId });
      if (selectedVoiceId === voiceId) {
        setSelectedVoiceId(null);
        setPresetRefStorageId(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec suppression");
    }
  }

  async function onPreviewVoice() {
    if (
      voiceMode === "keep" &&
      !voiceRefFile &&
      !presetRefStorageId
    ) {
      setVoicePreviewError(
        "Ajoute un échantillon ou choisis un preset clone pour écouter.",
      );
      return;
    }
    if (voiceMode === "create" && !instruct) {
      setVoicePreviewError("Choisis des attributs Voice Lab avant d’écouter.");
      return;
    }
    setVoicePreviewing(true);
    setVoicePreviewError(null);
    // Révoque l’ancien blob sans toucher à l’erreur affichée
    setVoicePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      let refAudioBase64: string | undefined;
      let refMime: string | undefined;
      if (voiceMode === "keep") {
        if (voiceRefFile) {
          if (voiceRefFile.size > 8_000_000) {
            throw new Error("Échantillon trop lourd pour l’aperçu (max 8 Mo)");
          }
          refAudioBase64 = await fileToBase64(voiceRefFile);
          refMime = voiceRefFile.type || "audio/wav";
        } else if (presetRefUrl) {
          const res = await fetch(presetRefUrl);
          if (!res.ok) throw new Error("Impossible de charger l’échantillon");
          const blob = await res.blob();
          if (blob.size > 8_000_000) {
            throw new Error("Échantillon trop lourd pour l’aperçu (max 8 Mo)");
          }
          refAudioBase64 = await fileToBase64(blob);
          refMime = blob.type || "audio/wav";
        } else {
          throw new Error("Échantillon encore en chargement — réessaie");
        }
      }

      const res = await fetch("/api/preview-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLang,
          sourceLang,
          speed,
          ...(voiceMode === "create" && instruct ? { instruct } : {}),
          ...(refAudioBase64 ? { refAudioBase64, refMime } : {}),
        }),
      });
      const body = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Aperçu échoué (${res.status})`);
      }
      if (!body.audioBase64) {
        throw new Error("Aperçu vide");
      }
      const bin = atob(body.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: body.mimeType || "audio/wav",
      });
      const url = URL.createObjectURL(blob);
      setVoicePreviewUrl(url);
    } catch (err) {
      setVoicePreviewError(
        err instanceof Error ? err.message : "Échec aperçu voix",
      );
    } finally {
      setVoicePreviewing(false);
    }
  }

  const canPreview =
    voiceMode === "model" ||
    (voiceMode === "create" && !!instruct) ||
    (voiceMode === "keep" && (!!voiceRefFile || !!presetRefStorageId));

  const previewButton = (
    <button
      type="button"
      disabled={voicePreviewing || !canPreview}
      onClick={() => void onPreviewVoice()}
      className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--signal)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      <Play className="size-4" aria-hidden />
      {voicePreviewing ? "Génération…" : "Écouter l’aperçu"}
    </button>
  );

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
      } else if (cloneVoice && presetRefStorageId) {
        refStorageId = presetRefStorageId;
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
          ...(voiceMode === "create" && instruct ? { instruct } : {}),
          ...(selectedVoiceId ? { voicePresetId: selectedVoiceId } : {}),
          speed,
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

  const speedLabel =
    speed < 0.9 ? "Plus lente" : speed > 1.1 ? "Plus vive" : "Naturelle";

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
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <LangPicker
                label="Langue source"
                value={sourceLang}
                onChange={setSourceLang}
              />
              <LangPicker
                label="Langue cible"
                value={targetLang}
                onChange={(lang) => {
                  setTargetLang(lang);
                  if (lang !== "en" && !lang.startsWith("en")) {
                    setAccent("");
                  }
                }}
              />
            </div>

            {/* Voix publiques OmniVoice (recettes instruct curatées) */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Voix publiques</legend>
              <p className="text-xs text-[var(--muted)]">
                OmniVoice n’a pas de catalogue d’IDs comme ElevenLabs — ce sont
                des recettes Voice Lab prêtes à l’emploi.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PUBLIC_VOICES.map((voice) => {
                  const on = selectedPublicId === voice.id;
                  return (
                    <li key={voice.id}>
                      <button
                        type="button"
                        onClick={() => applyPublicVoice(voice)}
                        className={
                          on
                            ? "flex min-h-[4.5rem] w-full flex-col items-start rounded-2xl bg-[var(--ink)] px-3.5 py-3 text-left text-white"
                            : "flex min-h-[4.5rem] w-full flex-col items-start rounded-2xl border border-[var(--line)] bg-white px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                        }
                      >
                        <span className="text-sm font-semibold">
                          {voice.name}
                        </span>
                        <span
                          className={
                            on
                              ? "mt-0.5 text-xs text-white/65"
                              : "mt-0.5 text-xs text-[var(--muted)]"
                          }
                        >
                          {voice.blurb}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {/* Mes voix — presets type ElevenLabs */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Mes voix</legend>
              {savedVoices === undefined ? (
                <p className="text-xs text-[var(--muted)]">Chargement…</p>
              ) : savedVoices.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)] px-3 py-3 text-xs text-[var(--muted)]">
                  Aucune voix sauvegardée. Compose dans Voice Lab ou clone un
                  échantillon, puis enregistre.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {savedVoices.map((voice) => {
                    const on = selectedVoiceId === voice._id;
                    return (
                      <li key={voice._id} className="relative">
                        <button
                          type="button"
                          onClick={() => applySavedVoice(voice)}
                          className={
                            on
                              ? "flex min-h-14 w-full flex-col items-start rounded-2xl bg-[var(--ink)] px-4 py-3 text-left text-white"
                              : "flex min-h-14 w-full flex-col items-start rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                          }
                        >
                          <span className="text-sm font-semibold">
                            {voice.name}
                          </span>
                          <span
                            className={
                              on
                                ? "mt-0.5 text-xs text-white/65"
                                : "mt-0.5 text-xs text-[var(--muted)]"
                            }
                          >
                            {voice.kind === "design"
                              ? voice.instruct || "Voice Lab"
                              : "Clone · échantillon"}
                            {typeof voice.speed === "number"
                              ? ` · ${voice.speed.toFixed(2)}×`
                              : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Supprimer ${voice.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteVoice(voice._id);
                          }}
                          className={
                            on
                              ? "absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                              : "absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--danger)]"
                          }
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            {/* Voice mode — 3 clear paths */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Comment obtenir la voix ?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      id: "keep" as const,
                      title: "Ma voix",
                      desc: "Clone depuis un échantillon",
                      Icon: Mic2,
                    },
                    {
                      id: "model" as const,
                      title: "Voix modèle",
                      desc: "Choix automatique OmniVoice",
                      Icon: AudioLines,
                    },
                    {
                      id: "create" as const,
                      title: "Créer une voix",
                      desc: "Compose genre, âge, timbre",
                      Icon: Wand2,
                    },
                  ] as const
                ).map(({ id, title, desc, Icon }) => {
                  const on = voiceMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setVoiceMode(id);
                        setSelectedVoiceId(null);
                        setSelectedPublicId(null);
                        if (id !== "keep") setPresetRefStorageId(null);
                        setShowSaveForm(false);
                        clearVoicePreview();
                      }}
                      className={
                        on
                          ? "group relative min-h-[5.5rem] overflow-hidden rounded-2xl bg-[var(--ink)] px-4 py-3.5 text-left text-white transition-transform duration-200"
                          : "min-h-[5.5rem] rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-left transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--bg-subtle)]"
                      }
                    >
                      {on && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-[var(--signal)]/25 blur-2xl"
                        />
                      )}
                      <Icon
                        className={
                          on
                            ? "relative mb-2 size-4 text-[var(--signal-soft)]"
                            : "mb-2 size-4 text-[var(--muted)]"
                        }
                        aria-hidden
                      />
                      <span className="relative block text-sm font-semibold">
                        {title}
                      </span>
                      <span
                        className={
                          on
                            ? "relative mt-0.5 block text-xs font-normal text-white/65"
                            : "mt-0.5 block text-xs font-normal text-[var(--muted)]"
                        }
                      >
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {voiceMode === "keep" && dubMode === "narration" && (
              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">
                    Échantillon de ta voix
                  </span>
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                    onChange={(e) => {
                      setVoiceRefFile(e.target.files?.[0] ?? null);
                      setPresetRefStorageId(null);
                      setSelectedVoiceId(null);
                    }}
                    className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[var(--ink)] file:px-4 file:text-sm file:font-semibold file:text-white"
                  />
                  {voiceRefFile && (
                    <span className="text-xs text-[var(--muted)]">
                      {voiceRefFile.name} ·{" "}
                      {(voiceRefFile.size / 1024).toFixed(0)} Ko
                    </span>
                  )}
                  {!voiceRefFile && presetRefStorageId && (
                    <span className="text-xs text-[var(--signal)]">
                      Échantillon du preset sélectionné
                    </span>
                  )}
                </label>
                {(voiceRefFile || presetRefStorageId) && (
                  <SaveVoiceBar
                    showForm={showSaveForm}
                    saveName={saveName}
                    saving={savingVoice}
                    onToggle={() => setShowSaveForm((v) => !v)}
                    onName={setSaveName}
                    onSave={() => void onSaveVoice()}
                    hint="Enregistrer ce clone"
                  />
                )}
              </div>
            )}

            {voiceMode === "keep" && dubMode === "doublage" && (
              <p className="rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-xs text-[var(--muted)]">
                En doublage, la voix est clonée depuis l’audio source (pas besoin
                d’échantillon séparé).
              </p>
            )}

            {/* Voice Lab */}
            {voiceMode === "create" && (
              <div className="space-y-5 rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--bg)_0%,var(--bg-elevated)_45%,var(--signal-soft)_160%)] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                      <UserRound className="size-4 text-[var(--signal)]" aria-hidden />
                      Voice Lab
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Compose une voix en quelques chips — plus clair qu’une
                      liste de sliders.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    Genre
                  </p>
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
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    Âge
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AGE.map((a) => (
                      <Chip
                        key={a.id}
                        active={age === a.id}
                        onClick={() => setAge(age === a.id ? "" : a.id)}
                      >
                        {a.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    Timbre
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PITCH.map((p) => (
                      <Chip
                        key={p.id}
                        active={pitch === p.id}
                        onClick={() => setPitch(pitch === p.id ? "" : p.id)}
                        size="sm"
                      >
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Chip
                    active={whisper}
                    onClick={() => setWhisper((w) => !w)}
                  >
                    Chuchotement
                  </Chip>
                  {!showAccents && (
                    <p className="text-xs text-[var(--muted)]">
                      Accents EN : passe la langue cible en anglais.
                    </p>
                  )}
                </div>

                {showAccents && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Accent (anglais)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Chip
                        active={!accent}
                        onClick={() => setAccent("")}
                        size="sm"
                      >
                        Neutre
                      </Chip>
                      {ACCENTS.map((a) => (
                        <Chip
                          key={a.id}
                          active={accent === a.id}
                          onClick={() =>
                            setAccent(accent === a.id ? "" : a.id)
                          }
                          size="sm"
                        >
                          {a.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-2.5 backdrop-blur-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                    Recette OmniVoice
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--signal)] sm:text-sm">
                    {instruct || "— choisis au moins un attribut"}
                  </p>
                </div>

                {!!instruct && (
                  <SaveVoiceBar
                    showForm={showSaveForm}
                    saveName={saveName}
                    saving={savingVoice}
                    onToggle={() => setShowSaveForm((v) => !v)}
                    onName={setSaveName}
                    onSave={() => void onSaveVoice()}
                    hint="Enregistrer cette voix"
                  />
                )}
              </div>
            )}

            {/* Aperçu audio — toujours visible étape 2 */}
            <div className="space-y-3 rounded-2xl border border-[var(--signal)]/30 bg-[var(--signal-soft)]/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Aperçu de la voix</p>
                  <p className="text-xs text-[var(--muted)]">
                    Phrase courte dans la langue cible · {targetLang} ·{" "}
                    {speed.toFixed(2)}×
                  </p>
                </div>
                {previewButton}
              </div>
              {voicePreviewError && (
                <p className="rounded-lg border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-ink)]">
                  {voicePreviewError}
                </p>
              )}
              {voicePreviewUrl ? (
                <audio
                  ref={previewAudioRef}
                  key={voicePreviewUrl}
                  controls
                  src={voicePreviewUrl}
                  className="w-full"
                />
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  {voiceMode === "keep"
                    ? "Choisis un échantillon puis Écouter."
                    : voiceMode === "create"
                      ? "Compose Voice Lab (ou une voix publique) puis Écouter."
                      : "Voix modèle : Écouter pour un sample Auto OmniVoice."}
                </p>
              )}
            </div>

            {/* Speed — all voice modes */}
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Gauge className="size-4 text-[var(--muted)]" aria-hidden />
                  Rythme
                </p>
                <span className="rounded-full bg-[var(--signal-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--signal)]">
                  {speed.toFixed(2)}× · {speedLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SPEED_PRESETS.map((p) => (
                  <Chip
                    key={p.id}
                    active={Math.abs(speed - p.id) < 0.01}
                    onClick={() => setSpeed(p.id)}
                    size="sm"
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              <label className="block space-y-1">
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--ink)]"
                />
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  <span>0.7×</span>
                  <span>1.0×</span>
                  <span>1.3×</span>
                </div>
              </label>
            </div>

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
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>
                  Source · {sourceLang} → {targetLang}
                </span>
                <span aria-hidden>·</span>
                <span>
                  {voiceMode === "keep"
                    ? "Clone"
                    : voiceMode === "create"
                      ? "Voix créée"
                      : "Voix modèle"}
                </span>
                <span aria-hidden>·</span>
                <span>{speed.toFixed(2)}×</span>
                {voiceMode === "create" && instruct && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono text-[var(--signal)]">
                      {instruct}
                    </span>
                  </>
                )}
              </div>
              {sourceTextSnap ? (
                <p className="line-clamp-2 text-xs text-[var(--muted)]">
                  Origine : {sourceTextSnap}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Texte lu (aperçu)</span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  Clique un tag pour l’insérer
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXPRESS_TAGS.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() =>
                      insertAtCursor(
                        spokenText,
                        setSpokenText,
                        spokenRef,
                        t.tag,
                      )
                    }
                    className="min-h-8 rounded-lg border border-[var(--line)] bg-white px-2.5 text-xs font-medium transition-colors duration-150 hover:border-[var(--signal)] hover:bg-[var(--signal-soft)] hover:text-[var(--signal)]"
                    title={t.tag}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={spokenRef}
                value={spokenText}
                onChange={(e) => setSpokenText(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-shadow duration-200 focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                placeholder="Corrige légèrement si besoin… ou ajoute [laughter]"
              />
              <p className="text-xs text-[var(--muted)]">
                Tags natifs OmniVoice ([laughter], [sigh]…). Le texte part tel
                quel au TTS.
              </p>
            </div>

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

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
  BookmarkPlus,
  Gauge,
  Mic2,
  Play,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { LangPicker } from "./LangPicker";
import { DubProjectsList } from "./DubProjectsList";
import { StudioAudioPlayer } from "./StudioAudioPlayer";
import { Badge } from "./ui/badge";
import { PUBLIC_VOICES, type PublicVoice } from "../lib/publicVoices";
import { VoiceCatalog, type VoiceShelf } from "./VoiceCatalog";
import type { Doc, Id } from "@convex/_generated/dataModel";

type DubMode = "narration" | "doublage";
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

export function DubPanel({ sessionId, jobs }: Props) {
  const [activeProjectId, setActiveProjectId] = useState<Id<"projects"> | null>(
    null,
  );
  const [projectTitle, setProjectTitle] = useState("Nouveau projet");
  const [hydratedId, setHydratedId] = useState<Id<"projects"> | null>(null);
  const [dubMode, setDubMode] = useState<DubMode>("narration");
  const [text, setText] = useState(
    "Bonjour, bienvenue dans notre atelier. Aujourd'hui on parle de création locale.",
  );
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [voiceRefFile, setVoiceRefFile] = useState<File | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("model");
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
  const [draftSourceStorageId, setDraftSourceStorageId] = useState<
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
  const [voiceShelf, setVoiceShelf] = useState<VoiceShelf>("public");
  const [showVoiceLab, setShowVoiceLab] = useState(false);
  const [showCloneUpload, setShowCloneUpload] = useState(false);
  const [pendingClonePreview, setPendingClonePreview] = useState(false);

  const spokenRef = useRef<HTMLTextAreaElement>(null);
  const skipSaveRef = useRef(false);

  const createJob = useMutation(api.jobs.create);
  const generateUploadUrl = useMutation(api.jobs.generateUploadUrl);
  const saveVoice = useMutation(api.voices.create);
  const removeVoice = useMutation(api.voices.remove);
  const updateProject = useMutation(api.projects.update);

  const projects = useQuery(
    api.projects.listBySession,
    sessionId ? { sessionId, limit: 80 } : "skip",
  );
  const dubProjects = useMemo(
    () =>
      projects?.filter((p) => p.kind === "dub" || p.kind === "narration") ??
      undefined,
    [projects],
  );

  const activeProject = useQuery(
    api.projects.get,
    sessionId && activeProjectId
      ? { sessionId, projectId: activeProjectId }
      : "skip",
  );
  const projectJobs = useQuery(
    api.jobs.listByProject,
    sessionId && activeProjectId
      ? { sessionId, projectId: activeProjectId, limit: 30 }
      : "skip",
  );

  const savedVoices = useQuery(
    api.voices.listBySession,
    sessionId ? { sessionId } : "skip",
  );
  const presetRefUrl = useQuery(
    api.jobs.getFileUrl,
    presetRefStorageId ? { storageId: presetRefStorageId } : "skip",
  );
  const readyJob = useMemo(
    () =>
      (projectJobs ?? jobs)?.find(
        (j) => j.status === "done" && j.resultStorageId,
      ),
    [projectJobs, jobs],
  );
  const activeJob = useMemo(
    () =>
      (projectJobs ?? jobs)?.find(
        (j) => j.status === "running" || j.status === "queued",
      ),
    [projectJobs, jobs],
  );
  const resultStorageId =
    activeProject?.latestResultStorageId ?? readyJob?.resultStorageId;
  const readyJobUrl = useQuery(
    api.jobs.getFileUrl,
    resultStorageId ? { storageId: resultStorageId } : "skip",
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

  // Hydrate atelier depuis le brouillon projet
  useEffect(() => {
    if (!activeProject || !activeProjectId) return;
    if (hydratedId === activeProjectId) return;
    skipSaveRef.current = true;
    const d = (activeProject.draft ?? {}) as Record<string, unknown>;
    setProjectTitle(activeProject.title);
    setDubMode(d.mode === "doublage" ? "doublage" : "narration");
    setText(typeof d.text === "string" ? d.text : "");
    setSourceLang(typeof d.sourceLang === "string" ? d.sourceLang : "fr");
    setTargetLang(typeof d.targetLang === "string" ? d.targetLang : "wo");
    setVoiceMode(
      d.voiceMode === "keep" || d.voiceMode === "create" || d.voiceMode === "model"
        ? d.voiceMode
        : "model",
    );
    setGender(typeof d.gender === "string" ? d.gender : "female");
    setAge(typeof d.age === "string" ? d.age : "young adult");
    setPitch(typeof d.pitch === "string" ? d.pitch : "moderate pitch");
    setAccent(typeof d.accent === "string" ? d.accent : "");
    setWhisper(d.whisper === true);
    setSpeed(typeof d.speed === "number" ? d.speed : 1);
    setSelectedPublicId(
      typeof d.selectedPublicId === "string" ? d.selectedPublicId : null,
    );
    setSelectedVoiceId(
      typeof d.voicePresetId === "string"
        ? (d.voicePresetId as Id<"voices">)
        : null,
    );
    setSpokenText(typeof d.spokenText === "string" ? d.spokenText : "");
    setSourceTextSnap(
      typeof d.sourceTextSnap === "string" ? d.sourceTextSnap : "",
    );
    setPresetRefStorageId(
      typeof d.refStorageId === "string"
        ? (d.refStorageId as Id<"_storage">)
        : null,
    );
    setDraftSourceStorageId(
      typeof d.sourceStorageId === "string"
        ? (d.sourceStorageId as Id<"_storage">)
        : null,
    );
    setShowVoiceLab(d.voiceMode === "create");
    setShowCloneUpload(d.voiceMode === "keep");
    setAudioFile(null);
    setVoiceRefFile(null);
    setVoiceConsent(false);
    clearVoicePreview();
    setHydratedId(activeProjectId);
    queueMicrotask(() => {
      skipSaveRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, activeProjectId, hydratedId]);

  // Autosave brouillon
  useEffect(() => {
    if (!activeProjectId || !sessionId || hydratedId !== activeProjectId) return;
    if (skipSaveRef.current) return;
    const t = window.setTimeout(() => {
      void updateProject({
        sessionId,
        projectId: activeProjectId,
        title: projectTitle,
        draft: {
          mode: dubMode,
          text,
          sourceLang,
          targetLang,
          voiceMode,
          ...(voiceMode === "create" && instruct ? { instruct } : {}),
          gender: gender || undefined,
          age: age || undefined,
          pitch: pitch || undefined,
          accent: accent || undefined,
          whisper,
          speed,
          selectedPublicId: selectedPublicId ?? undefined,
          voicePresetId: selectedVoiceId ?? undefined,
          spokenText: spokenText || undefined,
          sourceTextSnap: sourceTextSnap || undefined,
          sourceStorageId: draftSourceStorageId ?? undefined,
          refStorageId: presetRefStorageId ?? undefined,
        },
      }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(t);
  }, [
    activeProjectId,
    sessionId,
    hydratedId,
    projectTitle,
    dubMode,
    text,
    sourceLang,
    targetLang,
    voiceMode,
    instruct,
    gender,
    age,
    pitch,
    accent,
    whisper,
    speed,
    selectedPublicId,
    selectedVoiceId,
    spokenText,
    sourceTextSnap,
    draftSourceStorageId,
    presetRefStorageId,
    updateProject,
  ]);

  useEffect(() => {
    return () => {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    };
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
      : audioFile !== null || !!draftSourceStorageId);

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
  const inReview = spokenText.trim().length > 0;

  const canSubmit =
    inReview && voiceConsent && spokenText.trim().length > 0 && step2Ok;

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
    setVoiceShelf("mine");
    clearVoicePreview();
    if (typeof voice.speed === "number" && Number.isFinite(voice.speed)) {
      setSpeed(Math.min(1.3, Math.max(0.7, voice.speed)));
    }
    if (voice.kind === "design") {
      setVoiceMode("create");
      setShowVoiceLab(false);
      setShowCloneUpload(false);
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
    setShowVoiceLab(false);
    setShowCloneUpload(false);
    setPresetRefStorageId(voice.refStorageId ?? null);
    setVoiceRefFile(null);
  }

  function applyPublicVoice(voice: PublicVoice) {
    setSelectedPublicId(voice.id);
    setSelectedVoiceId(null);
    setPresetRefStorageId(null);
    setVoiceRefFile(null);
    setShowVoiceLab(false);
    setShowCloneUpload(false);
    setVoiceShelf("public");
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

  async function onPreviewVoice(opts?: {
    mode?: VoiceMode;
    instructOverride?: string;
    refFile?: File | null;
    refStorageId?: Id<"_storage"> | null;
  }) {
    const mode = opts?.mode ?? voiceMode;
    const instructValue =
      opts?.instructOverride !== undefined
        ? opts.instructOverride
        : instruct;
    const refFile = opts?.refFile !== undefined ? opts.refFile : voiceRefFile;
    const refStorage =
      opts?.refStorageId !== undefined
        ? opts.refStorageId
        : presetRefStorageId;

    if (mode === "keep" && !refFile && !refStorage) {
      setVoicePreviewError(
        "Ajoute un échantillon ou choisis un preset clone pour écouter.",
      );
      return;
    }
    if (mode === "create" && !instructValue) {
      setVoicePreviewError("Choisis des attributs Voice Lab avant d’écouter.");
      return;
    }
    setVoicePreviewing(true);
    setVoicePreviewError(null);
    setVoicePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      let refAudioBase64: string | undefined;
      let refMime: string | undefined;
      if (mode === "keep") {
        if (refFile) {
          if (refFile.size > 8_000_000) {
            throw new Error("Échantillon trop lourd pour l’aperçu (max 8 Mo)");
          }
          refAudioBase64 = await fileToBase64(refFile);
          refMime = refFile.type || "audio/wav";
        } else if (refStorage && presetRefUrl) {
          const res = await fetch(presetRefUrl);
          if (!res.ok) throw new Error("Impossible de charger l’échantillon");
          const blob = await res.blob();
          if (blob.size > 8_000_000) {
            throw new Error("Échantillon trop lourd pour l’aperçu (max 8 Mo)");
          }
          refAudioBase64 = await fileToBase64(blob);
          refMime = blob.type || "audio/wav";
        } else if (refStorage) {
          throw new Error("Échantillon encore en chargement. Réessaie.");
        }
      }

      const res = await fetch("/api/preview-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLang,
          sourceLang,
          previewLang: "en",
          speed,
          ...(mode === "create" && instructValue
            ? { instruct: instructValue }
            : {}),
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

  useEffect(() => {
    if (!pendingClonePreview) return;
    if (voiceMode !== "keep") {
      setPendingClonePreview(false);
      return;
    }
    if (presetRefStorageId && !presetRefUrl) return;
    setPendingClonePreview(false);
    void onPreviewVoice({
      mode: "keep",
      refStorageId: presetRefStorageId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClonePreview, presetRefUrl, presetRefStorageId, voiceMode]);

  const canPreview =
    voiceMode === "model" ||
    (voiceMode === "create" && !!instruct) ||
    (voiceMode === "keep" && (!!voiceRefFile || !!presetRefStorageId));

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
      setVoiceConsent(false);
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
      let sourceStorageId: string | undefined = draftSourceStorageId ?? undefined;
      let refStorageId: string | undefined;
      if (dubMode === "doublage" && audioFile) {
        sourceStorageId = await uploadAudio(audioFile);
        setDraftSourceStorageId(sourceStorageId as Id<"_storage">);
      }
      if (cloneVoice && voiceRefFile) {
        refStorageId = await uploadAudio(voiceRefFile);
      } else if (cloneVoice && presetRefStorageId) {
        refStorageId = presetRefStorageId;
      }

      await createJob({
        type: dubMode === "doublage" ? "dub" : "narration",
        sessionId,
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
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

  const voiceCatalogProps = {
    shelf: voiceShelf,
    onShelfChange: setVoiceShelf,
    selectedPublicId,
    selectedVoiceId,
    savedVoices,
    onSelectPublic: applyPublicVoice,
    onSelectSaved: applySavedVoice,
    onDeleteSaved: (voiceId: Id<"voices">) => void onDeleteVoice(voiceId),
    onPlayPublic: (voice: PublicVoice) => {
      applyPublicVoice(voice);
      void onPreviewVoice({
        mode: voice.instruct ? "create" : "model",
        instructOverride: voice.instruct || undefined,
      });
    },
    onPlaySaved: (voice: Doc<"voices">) => {
      applySavedVoice(voice);
      if (voice.kind === "design") {
        void onPreviewVoice({
          mode: "create",
          instructOverride: voice.instruct || undefined,
        });
      } else {
        setPendingClonePreview(true);
      }
    },
    playLoading: voicePreviewing,
    onCreateDesign: () => {
      setVoiceShelf("mine");
      setShowVoiceLab(true);
      setShowCloneUpload(false);
      setVoiceMode("create");
      setSelectedPublicId(null);
      setSelectedVoiceId(null);
      setPresetRefStorageId(null);
      setVoiceRefFile(null);
      setShowSaveForm(false);
      clearVoicePreview();
    },
    onCreateClone: () => {
      setVoiceShelf("mine");
      setShowCloneUpload(true);
      setShowVoiceLab(false);
      setVoiceMode("keep");
      setSelectedPublicId(null);
      setSelectedVoiceId(null);
      setPresetRefStorageId(null);
      setVoiceRefFile(null);
      setShowSaveForm(false);
      clearVoicePreview();
    },
  } as const;

  function clearReview() {
    setSpokenText("");
    setSourceTextSnap("");
    setVoiceConsent(false);
    setPreviewError(null);
  }

  const playerTrack = useMemo(() => {
    if (voicePreviewUrl) {
      const savedName = selectedVoiceId
        ? savedVoices?.find((v) => v._id === selectedVoiceId)?.name
        : undefined;
      const publicName = selectedPublicId
        ? PUBLIC_VOICES.find((v) => v.id === selectedPublicId)?.name
        : undefined;
      const label =
        publicName ??
        savedName ??
        (voiceMode === "create"
          ? "Voice Lab"
          : voiceMode === "keep"
            ? "Clone"
            : "Modèle");
      return {
        url: voicePreviewUrl,
        title: `Aperçu · ${label}`,
        subtitle: `Sample EN · ${speed.toFixed(2)}× · cible ${targetLang}`,
      };
    }
    if (readyJobUrl && readyJob) {
      const p = readyJob.params as Record<string, unknown>;
      const text = String(p.text ?? "");
      return {
        url: readyJobUrl,
        title: text
          ? text.length > 56
            ? `${text.slice(0, 56)}…`
            : text
          : "Dernier rendu",
        subtitle: `${String(p.sourceLang ?? "?")} → ${String(p.targetLang ?? "?")}`,
        downloadUrl: readyJobUrl,
      };
    }
    return null;
  }, [
    voicePreviewUrl,
    selectedPublicId,
    selectedVoiceId,
    savedVoices,
    voiceMode,
    speed,
    targetLang,
    readyJobUrl,
    readyJob,
  ]);

  const playerPending = activeJob
    ? {
        label:
          activeJob.status === "running"
            ? "Génération en cours…"
            : "En file d’attente…",
        progress: activeJob.progress ?? 8,
      }
    : null;

  if (!activeProjectId) {
    return (
      <DubProjectsList
        sessionId={sessionId}
        projects={dubProjects}
        loading={projects === undefined}
        jobs={jobs}
        onOpen={(id) => {
          setHydratedId(null);
          setActiveProjectId(id);
        }}
      />
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveProjectId(null);
            setHydratedId(null);
            clearVoicePreview();
          }}
          className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Projets
        </button>
        <input
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight outline-none hover:border-[var(--line)] focus:border-[var(--line-strong)] focus:bg-[var(--bg-elevated)] sm:text-2xl"
          aria-label="Titre du projet"
        />
      </header>

      <form onSubmit={onGenerate} className="space-y-0">
        <div className="grid gap-0 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,32%)] lg:items-stretch">
          <div className="flex min-h-[28rem] flex-col border-[var(--line)] lg:border-r">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
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
                      ? "min-h-9 rounded-lg bg-[var(--ink)] px-3.5 text-sm font-semibold text-white"
                      : "min-h-9 rounded-lg border border-[var(--line)] bg-white px-3.5 text-sm font-medium hover:bg-[var(--bg-subtle)]"
                  }
                >
                  {label}
                </button>
              ))}
              {dubMode === "doublage" && (
                <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--line-strong)] px-3 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg-subtle)]">
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                    onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  {audioFile
                    ? audioFile.name
                    : draftSourceStorageId
                      ? "Audio source (enregistré)"
                      : "Audio source"}
                </label>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4 sm:p-5">
              <label className="flex min-h-0 flex-1 flex-col gap-2">
                <span className="text-sm font-medium">
                  {inReview ? "Script source" : "Script"}
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={inReview ? 4 : 12}
                  className="min-h-[12rem] w-full flex-1 resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                  placeholder={
                    dubMode === "narration"
                      ? "Colle le texte à narrer…"
                      : "Colle le texte à traduire…"
                  }
                />
              </label>

              {inReview && (
                <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Texte lu (aperçu)</p>
                      {sourceTextSnap ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                          Traduit depuis : {sourceTextSnap}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={clearReview}
                      className="flex min-h-8 items-center gap-1 rounded-md border border-[var(--line)] px-2.5 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                    >
                      <X className="size-3.5" aria-hidden />
                      Recommencer
                    </button>
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
                        className="min-h-8 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs font-medium hover:border-[var(--signal)] hover:bg-[var(--signal-soft)] hover:text-[var(--signal)]"
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
                    rows={5}
                    className="w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-[var(--line-strong)] focus:ring-2 focus:ring-[var(--signal)]/30"
                    placeholder="Corrige légèrement si besoin…"
                  />
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)] px-3 py-3">
                    <input
                      type="checkbox"
                      checked={voiceConsent}
                      onChange={(e) => setVoiceConsent(e.target.checked)}
                      className="mt-1 size-4 accent-[var(--ink)]"
                    />
                    <span className="text-sm leading-snug">
                      Je confirme le{" "}
                      <strong className="font-semibold">
                        consentement explicite
                      </strong>{" "}
                      pour toute voix / clonage audio.
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <aside
            aria-label="Réglages"
            className="flex flex-col bg-[var(--bg-elevated)] lg:max-h-[calc(100dvh-8rem)]"
          >
            <div className="border-b border-[var(--line)] px-4 py-3">
              <p className="text-sm font-semibold tracking-tight">Réglages</p>
              <p className="text-xs text-[var(--muted)]">
                Langues, voix, rythme
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <div className="grid gap-3">
                <LangPicker
                  label="Source"
                  value={sourceLang}
                  onChange={setSourceLang}
                />
                <LangPicker
                  label="Cible"
                  value={targetLang}
                  onChange={(lang) => {
                    setTargetLang(lang);
                    if (lang !== "en" && !lang.startsWith("en")) {
                      setAccent("");
                    }
                  }}
                />
              </div>

              <div className="border-t border-[var(--line)] pt-4">
                <VoiceCatalog {...voiceCatalogProps} />
              </div>

              {showCloneUpload &&
                voiceMode === "keep" &&
                dubMode === "narration" && (
                  <div className="space-y-3 border-t border-[var(--line)] pt-4">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium">
                        Échantillon voix
                      </span>
                      <input
                        type="file"
                        accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
                        onChange={(e) => {
                          setVoiceRefFile(e.target.files?.[0] ?? null);
                          setPresetRefStorageId(null);
                          setSelectedVoiceId(null);
                        }}
                        className="block w-full text-xs file:mr-2 file:min-h-9 file:rounded-lg file:border-0 file:bg-[var(--ink)] file:px-3 file:text-xs file:font-semibold file:text-white"
                      />
                    </label>
                    {(voiceRefFile || presetRefStorageId) && (
                      <SaveVoiceBar
                        showForm={showSaveForm}
                        saveName={saveName}
                        saving={savingVoice}
                        onToggle={() => setShowSaveForm((v) => !v)}
                        onName={setSaveName}
                        onSave={() => void onSaveVoice()}
                        hint="Sauver le clone"
                      />
                    )}
                  </div>
                )}

              {voiceMode === "keep" && dubMode === "doublage" && (
                <p className="text-xs text-[var(--muted)]">
                  Doublage : voix clonée depuis l’audio source.
                </p>
              )}

              {showVoiceLab && voiceMode === "create" && (
                <div className="space-y-3 border-t border-[var(--line)] pt-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <UserRound
                      className="size-4 text-[var(--signal)]"
                      aria-hidden
                    />
                    Voice Lab
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {GENDER.map((g) => (
                      <Chip
                        key={g.id}
                        active={gender === g.id}
                        onClick={() => setGender(g.id)}
                        size="sm"
                      >
                        {g.label}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {AGE.map((a) => (
                      <Chip
                        key={a.id}
                        active={age === a.id}
                        onClick={() => setAge(a.id)}
                        size="sm"
                      >
                        {a.label}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PITCH.map((p) => (
                      <Chip
                        key={p.id}
                        active={pitch === p.id}
                        onClick={() => setPitch(p.id)}
                        size="sm"
                      >
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                  <Chip
                    active={whisper}
                    onClick={() => setWhisper((w) => !w)}
                    size="sm"
                  >
                    Chuchotement
                  </Chip>
                  {showAccents && (
                    <div className="flex flex-wrap gap-1.5">
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
                  )}
                  <p className="font-mono text-xs text-[var(--signal)]">
                    {instruct || "Genre + âge + timbre"}
                  </p>
                  {!!instruct && (
                    <SaveVoiceBar
                      showForm={showSaveForm}
                      saveName={saveName}
                      saving={savingVoice}
                      onToggle={() => setShowSaveForm((v) => !v)}
                      onName={setSaveName}
                      onSave={() => void onSaveVoice()}
                      hint="Sauver la voix"
                    />
                  )}
                </div>
              )}

              <div className="space-y-3 border-t border-[var(--line)] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Gauge
                      className="size-4 text-[var(--muted)]"
                      aria-hidden
                    />
                    Rythme
                  </p>
                  <span className="text-xs font-semibold text-[var(--signal)]">
                    {speed.toFixed(2)}× · {speedLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--ink)]"
                  aria-label={`Rythme ${speedLabel}`}
                />
              </div>

              {voicePreviewError && (
                <p className="text-xs text-[var(--warn-ink)]">
                  {voicePreviewError}
                </p>
              )}
              {previewError && (
                <p className="text-xs text-[var(--danger)]">{previewError}</p>
              )}
            </div>

            <div className="space-y-2 border-t border-[var(--line)] bg-[var(--bg)] p-4">
              <button
                type="button"
                disabled={voicePreviewing || !canPreview}
                onClick={() => void onPreviewVoice()}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40"
              >
                <Play className="size-3.5" aria-hidden />
                {voicePreviewing ? "Aperçu…" : "Écouter la voix"}
              </button>
              {!inReview ? (
                <button
                  type="button"
                  disabled={!canPrepare || previewing}
                  onClick={() => void onPrepare()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--ink)] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {previewing ? "Préparation…" : "Préparer la traduction"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || !canSubmit}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--ink)] text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Mic2 className="size-4" aria-hidden />
                  {submitting ? "Envoi…" : "Générer le doublage"}
                </button>
              )}
              <p className="text-center text-[10px] text-[var(--muted)]">
                {text.trim().length} car. · {sourceLang} → {targetLang}
              </p>
            </div>
          </aside>
        </div>
      </form>

      <div className="w-full">
        <StudioAudioPlayer
          track={playerTrack}
          pending={!playerTrack ? playerPending : null}
          emptyHint="Écoute un aperçu de voix ou génère — le lecteur s’affiche ici en pleine largeur."
          className="w-full rounded-[var(--radius)]"
        />
      </div>

      {projectJobs && projectJobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--muted)]">
            Versions de ce projet
          </h2>
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)]">
            {projectJobs.slice(0, 8).map((job) => (
              <li
                key={job._id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="text-[var(--muted)]">
                  {new Date(job.createdAt).toLocaleString("fr-FR")}
                </span>
                <Badge
                  tone={
                    job.status === "done"
                      ? "ok"
                      : job.status === "failed"
                        ? "danger"
                        : "muted"
                  }
                >
                  {job.status === "done"
                    ? "Prêt"
                    : job.status === "failed"
                      ? "Erreur"
                      : job.status === "running"
                        ? "Génération"
                        : "En file"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

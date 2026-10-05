/**
 * Jobs filtrés par sessionId (navigateur) ; identité Clerk dans `users`.
 * Projets créatifs (doublage, etc.) : brouillon éditable + jobs liés.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const jobType = v.union(
  v.literal("music"),
  v.literal("dub"),
  v.literal("narration"),
  /** Vague B — livre audio (texte long chunké) */
  v.literal("audiobook"),
  v.literal("clips"),
  /** Couche 3 — appliquer un plan d'édition (segments keep/discard) */
  v.literal("clip_edit"),
  /** Couche 4 — appliquer une suggestion (hook / cut / zoom) */
  v.literal("clip_suggest"),
  /** Export Reel 9:16 + timestamps brûlées */
  v.literal("clip_export"),
);

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

export const projectKind = v.union(
  v.literal("dub"),
  v.literal("narration"),
  v.literal("music"),
  v.literal("audiobook"),
  v.literal("clip"),
);

/** Brouillon doublage / narration (éditable dans l’atelier). */
export const dubDraft = v.object({
  mode: v.union(v.literal("narration"), v.literal("doublage")),
  text: v.string(),
  sourceLang: v.string(),
  targetLang: v.string(),
  voiceMode: v.union(
    v.literal("keep"),
    v.literal("model"),
    v.literal("create"),
  ),
  instruct: v.optional(v.string()),
  gender: v.optional(v.string()),
  age: v.optional(v.string()),
  pitch: v.optional(v.string()),
  accent: v.optional(v.string()),
  whisper: v.optional(v.boolean()),
  speed: v.optional(v.number()),
  selectedPublicId: v.optional(v.string()),
  voicePresetId: v.optional(v.id("voices")),
  spokenText: v.optional(v.string()),
  sourceTextSnap: v.optional(v.string()),
  sourceStorageId: v.optional(v.id("_storage")),
  refStorageId: v.optional(v.id("_storage")),
});

export default defineSchema({
  jobs: defineTable({
    type: jobType,
    status: jobStatus,
    params: v.any(),
    sessionId: v.string(),
    /** Projet parent (atelier) — optionnel pour jobs legacy */
    projectId: v.optional(v.id("projects")),
    progress: v.optional(v.number()),
    resultStorageId: v.optional(v.id("_storage")),
    /** Métadonnées résultat (ex. propositions de segments Couche 3) */
    resultMeta: v.optional(v.any()),
    /**
     * Vague B2 — reprise mid-job audiobook :
     * { nextIndex, chunkStorageIds[], chapters[] }
     */
    checkpoint: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_sessionId", ["sessionId"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_projectId", ["projectId"]),

  /**
   * Projets atelier — un doublage / musique / clip = un projet
   * avec brouillon durable + jobs de génération.
   */
  projects: defineTable({
    sessionId: v.string(),
    kind: projectKind,
    title: v.string(),
    /** Brouillon typé selon kind (aujourd’hui : dubDraft pour dub/narration) */
    draft: v.any(),
    latestJobId: v.optional(v.id("jobs")),
    latestResultStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_session_kind", ["sessionId", "kind"])
    .index("by_session_updated", ["sessionId", "updatedAt"]),

  library: defineTable({
    title: v.string(),
    mood: v.string(),
    durationS: v.number(),
    storageId: v.id("_storage"),
    createdAt: v.number(),
    prompt: v.string(),
  }),

  /** Presets voix (style ElevenLabs My Voices) — filtrés par sessionId. */
  voices: defineTable({
    sessionId: v.string(),
    name: v.string(),
    kind: v.union(v.literal("design"), v.literal("clone")),
    /** Recette OmniVoice, ex. "female, young adult, moderate pitch" */
    instruct: v.optional(v.string()),
    gender: v.optional(v.string()),
    age: v.optional(v.string()),
    pitch: v.optional(v.string()),
    accent: v.optional(v.string()),
    whisper: v.optional(v.boolean()),
    speed: v.optional(v.number()),
    /** Échantillon pour clone */
    refStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_sessionId", ["sessionId"]),

  /** Utilisateurs Clerk (sync à la connexion). */
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),
});

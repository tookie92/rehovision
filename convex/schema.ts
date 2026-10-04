/**
 * AVERTISSEMENT : Aucune authentification.
 * Ne pas exposer publiquement avant d'avoir ajouté Convex Auth ou équivalent.
 * Les jobs sont filtrés par sessionId (navigateur) — à remplacer plus tard
 * par l'identité utilisateur.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const jobType = v.union(
  v.literal("music"),
  v.literal("dub"),
  v.literal("narration"),
  v.literal("clips"),
  /** Couche 3 — appliquer un plan d'édition (segments keep/discard) */
  v.literal("clip_edit"),
  /** Couche 4 — appliquer une suggestion (hook / cut / zoom) */
  v.literal("clip_suggest"),
);

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

export default defineSchema({
  jobs: defineTable({
    type: jobType,
    status: jobStatus,
    params: v.any(),
    sessionId: v.string(),
    progress: v.optional(v.number()),
    resultStorageId: v.optional(v.id("_storage")),
    /** Métadonnées résultat (ex. propositions de segments Couche 3) */
    resultMeta: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_sessionId", ["sessionId"])
    .index("by_status_createdAt", ["status", "createdAt"]),

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
});

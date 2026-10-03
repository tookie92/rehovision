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
});

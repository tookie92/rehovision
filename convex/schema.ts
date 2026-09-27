import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Schéma Rehovision — Studios, projets vidéo, scènes et file de jobs GPU locaux.
 */
export default defineSchema({
  // Compte / chaîne géré par l'utilisateur (univers visuel propre)
  studios: defineTable({
    userId: v.string(),
    name: v.string(),
    // Description du style d'illustration (ex: gravures sombres, rouge/noir)
    visualStyle: v.string(),
    // Ton de narration (ex: grave, mystérieux)
    narrationTone: v.string(),
    // Image de référence de style (optionnel)
    referenceImageUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Projet de vidéo narrative illustrée
  videoProjects: defineTable({
    studioId: v.id("studios"),
    title: v.string(),
    // Sujet initial saisi par l'utilisateur
    topic: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("script_ready"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("exported"),
    ),
    finalVideoUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_studioId", ["studioId"])
    .index("by_status", ["status"]),

  // Scène du script (narration + image + audio)
  scenes: defineTable({
    videoProjectId: v.id("videoProjects"),
    order: v.number(),
    narrationText: v.string(),
    imagePrompt: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  }).index("by_videoProjectId", ["videoProjectId"]),

  // File d'attente pour le worker GPU local (et futur fallback API)
  generationJobs: defineTable({
    type: v.union(
      v.literal("script"),
      v.literal("image"),
      v.literal("voiceover"),
      v.literal("video_assembly"),
    ),
    // Absent pour script / video_assembly (portent sur le projet entier)
    sceneId: v.optional(v.id("scenes")),
    videoProjectId: v.id("videoProjects"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    provider: v.union(v.literal("local"), v.literal("api-fallback")),
    // Données nécessaires au job (prompt, texte, style, etc.)
    payload: v.any(),
    resultUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_videoProjectId", ["videoProjectId"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_sceneId", ["sceneId"]),

  // Suivi de consommation mensuelle pour le billing Clerk
  usage: defineTable({
    userId: v.string(),
    // Format "YYYY-MM"
    month: v.string(),
    videosGenerated: v.number(),
    imagesGenerated: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_month", ["userId", "month"]),
});

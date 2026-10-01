import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Schéma Rehovision — reels générés (legacy) + découpe type ChatCut (clipProjects).
 */
export default defineSchema({
  studios: defineTable({
    userId: v.string(),
    name: v.string(),
    visualStyle: v.string(),
    narrationTone: v.string(),
    /** Instruct OmniVoice explicite (ex. "female, medium pitch") */
    voiceInstruct: v.optional(v.string()),
    genre: v.optional(
      v.union(
        v.literal("true_crime"),
        v.literal("kids"),
        v.literal("history"),
        v.literal("custom"),
      ),
    ),
    referenceImageUrl: v.optional(v.string()),
    referenceStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  videoProjects: defineTable({
    studioId: v.id("studios"),
    title: v.string(),
    topic: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("script_ready"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("exported"),
    ),
    /** Preset look choisi avant génération */
    lookId: v.optional(v.string()),
    /** Preset voix OmniVoice choisi avant génération */
    voiceId: v.optional(v.string()),
    autoGenerateAssets: v.optional(v.boolean()),
    finalVideoUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_studioId", ["studioId"])
    .index("by_status", ["status"]),

  scenes: defineTable({
    videoProjectId: v.id("videoProjects"),
    order: v.number(),
    narrationText: v.string(),
    visualBeat: v.optional(v.string()),
    imagePrompt: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  }).index("by_videoProjectId", ["videoProjectId"]),

  /**
   * Projet Opus Clip : une source (fichier ou YouTube) → plusieurs clips.
   */
  clipProjects: defineTable({
    userId: v.string(),
    title: v.string(),
    status: v.union(
      v.literal("uploading"),
      v.literal("downloading"),
      v.literal("transcribing"),
      v.literal("proposing"),
      v.literal("rendering"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceVideoUrl: v.optional(v.string()),
    /** Fichier stocké sur le disque worker (upload local). */
    sourceLocalFileId: v.optional(v.string()),
    sourceYoutubeUrl: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    // Transcript JSON : { language, segments: [{ start, end, text }] }
    transcript: v.optional(v.any()),
    // Options de rendu Opus-like (appliquées au re-render)
    captionStyle: v.optional(
      v.union(
        v.literal("off"),
        v.literal("viral"),
        v.literal("bold_green"),
        v.literal("yellow_pop"),
        v.literal("minimal"),
        v.literal("neon_pink"),
        v.literal("impact"),
      ),
    ),
    layoutMode: v.optional(
      v.union(
        v.literal("smart"),
        v.literal("fill"),
        v.literal("fit"),
        v.literal("split"),
      ),
    ),
    /** Split : échange les demi-cadres haut/bas */
    splitSwap: v.optional(v.boolean()),
    /** Split : focus manuel haut (cx/cy 0–1, zoom ≥1). Absent = auto faces. */
    splitFocusTop: v.optional(
      v.object({
        cx: v.number(),
        cy: v.number(),
        zoom: v.number(),
      }),
    ),
    splitFocusBot: v.optional(
      v.object({
        cx: v.number(),
        cy: v.number(),
        zoom: v.number(),
      }),
    ),
    /** Smart/Fill : focus manuel 9:16. Absent = auto OpenCV / centre. */
    smartFocus: v.optional(
      v.object({
        cx: v.number(),
        cy: v.number(),
        zoom: v.number(),
      }),
    ),
    voiceoverMode: v.optional(
      v.union(
        v.literal("off"),
        v.literal("mix"),
        v.literal("replace"),
      ),
    ),
    audioEnhance: v.optional(
      v.union(v.literal("off"), v.literal("light")),
    ),
    // Look / filtre couleur (étape 6) — presets ffmpeg + LUT .cube custom
    lookFilter: v.optional(
      v.union(
        v.literal("off"),
        v.literal("warm"),
        v.literal("cool"),
        v.literal("contrast"),
        v.literal("soft_grain"),
        v.literal("lut"),
      ),
    ),
    lutStorageId: v.optional(v.id("_storage")),
    lutUrl: v.optional(v.string()),
    // Pack viral (étape 3)
    punchEffect: v.optional(
      v.union(
        v.literal("off"),
        v.literal("zoom"),
        v.literal("flash"),
        v.literal("grain"),
      ),
    ),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    logoCorner: v.optional(
      v.union(
        v.literal("tl"),
        v.literal("tr"),
        v.literal("bl"),
        v.literal("br"),
      ),
    ),
    logoOpacity: v.optional(v.number()),
    musicStorageId: v.optional(v.id("_storage")),
    musicUrl: v.optional(v.string()),
    musicVolume: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  clips: defineTable({
    clipProjectId: v.id("clipProjects"),
    order: v.number(),
    title: v.string(),
    hookReason: v.optional(v.string()),
    /** Score 0–100 proposé par le worker (qualité / viralité). */
    viralScore: v.optional(v.number()),
    startSec: v.number(),
    endSec: v.number(),
    // Texte pour captions (souvent extrait du transcript)
    captionText: v.optional(v.string()),
    status: v.union(
      v.literal("proposed"),
      v.literal("rendering"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    resultUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clipProjectId", ["clipProjectId"]),

  /** Étape 7 — assemblage 2–3 clips ready → 1 reel 9:16 */
  stitchedReels: defineTable({
    clipProjectId: v.id("clipProjects"),
    userId: v.string(),
    clipIds: v.array(v.id("clips")),
    title: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("rendering"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    resultUrl: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clipProjectId", ["clipProjectId"]),

  generationJobs: defineTable({
    type: v.union(
      v.literal("script"),
      v.literal("image"),
      v.literal("voiceover"),
      v.literal("video_assembly"),
      // ChatCut pipeline
      v.literal("transcribe"),
      v.literal("propose_clips"),
      v.literal("render_clip"),
      v.literal("stitch_clips"),
    ),
    sceneId: v.optional(v.id("scenes")),
    videoProjectId: v.optional(v.id("videoProjects")),
    clipProjectId: v.optional(v.id("clipProjects")),
    clipId: v.optional(v.id("clips")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
    provider: v.union(v.literal("local"), v.literal("api-fallback")),
    payload: v.any(),
    resultUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_videoProjectId", ["videoProjectId"])
    .index("by_clipProjectId", ["clipProjectId"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_sceneId", ["sceneId"]),

  usage: defineTable({
    userId: v.string(),
    month: v.string(),
    videosGenerated: v.number(),
    imagesGenerated: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_month", ["userId", "month"]),
});

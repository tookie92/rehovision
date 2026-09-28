import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { sliceCaptionSegments } from "./lib/captionSegments";

const clipProjectDoc = v.object({
  _id: v.id("clipProjects"),
  _creationTime: v.number(),
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
  sourceYoutubeUrl: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  transcript: v.optional(v.any()),
  captionStyle: v.optional(
    v.union(
      v.literal("viral"),
      v.literal("bold_green"),
      v.literal("yellow_pop"),
      v.literal("minimal"),
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
  voiceoverMode: v.optional(
    v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
  ),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
});

const clipDoc = v.object({
  _id: v.id("clips"),
  _creationTime: v.number(),
  clipProjectId: v.id("clipProjects"),
  order: v.number(),
  title: v.string(),
  hookReason: v.optional(v.string()),
  startSec: v.number(),
  endSec: v.number(),
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
});

function normalizeYoutubeUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Lien YouTube invalide");
  }
  const host = url.hostname.replace(/^www\./, "");
  const ok =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be" ||
    host === "music.youtube.com";
  if (!ok) {
    throw new Error("Seuls les liens YouTube sont acceptés pour l’instant");
  }
  return trimmed;
}

/**
 * URL d'upload Convex Storage pour un fichier vidéo local.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Import fichier (Opus Clip style) → Whisper.
 */
export const createFromUpload = mutation({
  args: {
    title: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim() || "Sans titre";
    const sourceVideoUrl = await ctx.storage.getUrl(args.storageId);
    if (!sourceVideoUrl) {
      throw new Error("Fichier introuvable dans le storage");
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("clipProjects", {
      userId,
      title,
      status: "transcribing",
      sourceStorageId: args.storageId,
      sourceVideoUrl,
      createdAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "transcribe",
      clipProjectId: projectId,
      status: "pending",
      provider: "local",
      payload: {
        sourceVideoUrl,
        language: "auto",
      },
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
  },
});

/**
 * Import lien YouTube → yt-dlp (worker) → Whisper.
 */
export const createFromYoutube = mutation({
  args: {
    title: v.optional(v.string()),
    youtubeUrl: v.string(),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const youtubeUrl = normalizeYoutubeUrl(args.youtubeUrl);
    const title = (args.title ?? "").trim() || "YouTube";

    const now = Date.now();
    const projectId = await ctx.db.insert("clipProjects", {
      userId,
      title,
      status: "downloading",
      sourceYoutubeUrl: youtubeUrl,
      createdAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "transcribe",
      clipProjectId: projectId,
      status: "pending",
      provider: "local",
      payload: {
        youtubeUrl,
        language: "auto",
      },
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
  },
});

const clipProjectSummary = v.object({
  _id: v.id("clipProjects"),
  _creationTime: v.number(),
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
  sourceYoutubeUrl: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  transcript: v.optional(v.any()),
  captionStyle: v.optional(
    v.union(
      v.literal("viral"),
      v.literal("bold_green"),
      v.literal("yellow_pop"),
      v.literal("minimal"),
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
  voiceoverMode: v.optional(
    v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
  ),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  clipCount: v.number(),
  readyClipCount: v.number(),
  failedClipCount: v.number(),
});

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(clipProjectSummary),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("clipProjects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const sliced = rows.slice(0, limit);

    const out = [];
    for (const project of sliced) {
      const clips = await ctx.db
        .query("clips")
        .withIndex("by_clipProjectId", (q) =>
          q.eq("clipProjectId", project._id),
        )
        .collect();
      out.push({
        ...project,
        clipCount: clips.length,
        readyClipCount: clips.filter((c) => c.status === "ready").length,
        failedClipCount: clips.filter((c) => c.status === "failed").length,
      });
    }
    return out;
  },
});

export const getById = query({
  args: { clipProjectId: v.id("clipProjects") },
  returns: v.union(
    v.object({
      project: clipProjectDoc,
      clips: v.array(clipDoc),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) return null;

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    clips.sort((a, b) => a.order - b.order);

    return { project, clips };
  },
});

/**
 * Relance le pipeline d'un projet en échec (YouTube ou fichier).
 */
export const retry = mutation({
  args: { clipProjectId: v.id("clipProjects") },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }

    const youtubeUrl = project.sourceYoutubeUrl;
    const sourceVideoUrl = project.sourceVideoUrl;
    if (!youtubeUrl && !sourceVideoUrl) {
      throw new Error("Aucune source à relancer");
    }

    const now = Date.now();

    // Annuler jobs encore pending/processing sur ce projet
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    for (const job of jobs) {
      if (job.status === "pending" || job.status === "processing") {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Annulé pour retry",
          updatedAt: now,
        });
      }
    }

    // Supprimer anciens clips
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    for (const c of clips) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.patch(args.clipProjectId, {
      status: youtubeUrl && !sourceVideoUrl ? "downloading" : "transcribing",
      transcript: undefined,
      errorMessage: undefined,
      durationSeconds: undefined,
    });

    await ctx.db.insert("generationJobs", {
      type: "transcribe",
      clipProjectId: args.clipProjectId,
      status: "pending",
      provider: "local",
      payload: youtubeUrl
        ? { youtubeUrl, language: "auto" }
        : { sourceVideoUrl, language: "auto" },
      createdAt: now,
      updatedAt: now,
    });

    return args.clipProjectId;
  },
});

/**
 * Relance uniquement les clips en échec (sans recommencer Whisper / hooks).
 */
export const retryFailedClips = mutation({
  args: { clipProjectId: v.id("clipProjects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    if (!project.sourceVideoUrl) {
      throw new Error("Vidéo source absente — relance le pipeline complet");
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    const failed = clips.filter((c) => c.status === "failed");
    if (failed.length === 0) {
      return 0;
    }

    const now = Date.now();
    const transcript = project.transcript;
    for (const clip of failed) {
      await ctx.db.patch(clip._id, {
        status: "rendering",
        errorMessage: undefined,
        resultUrl: undefined,
      });
      await ctx.db.insert("generationJobs", {
        type: "render_clip",
        clipProjectId: args.clipProjectId,
        clipId: clip._id,
        status: "pending",
        provider: "local",
        payload: {
          sourceVideoUrl: project.sourceVideoUrl,
          startSec: clip.startSec,
          endSec: clip.endSec,
          captionText: clip.captionText ?? "",
          captionSegments: sliceCaptionSegments(
            transcript,
            clip.startSec,
            clip.endSec,
          ),
          brollCues: [],
          captionStyle: project.captionStyle ?? "viral",
          layoutMode: project.layoutMode ?? "smart",
          voiceoverMode: project.voiceoverMode ?? "off",
          title: clip.title,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.clipProjectId, {
      status: "rendering",
      errorMessage: undefined,
    });

    return failed.length;
  },
});

/**
 * Met à jour les options de rendu (captions / layout / voiceover).
 */
export const updateRenderOptions = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    captionStyle: v.optional(
      v.union(
        v.literal("viral"),
        v.literal("bold_green"),
        v.literal("yellow_pop"),
        v.literal("minimal"),
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
    voiceoverMode: v.optional(
      v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
    ),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    const patch: {
      captionStyle?: typeof args.captionStyle;
      layoutMode?: typeof args.layoutMode;
      voiceoverMode?: typeof args.voiceoverMode;
    } = {};
    if (args.captionStyle !== undefined) patch.captionStyle = args.captionStyle;
    if (args.layoutMode !== undefined) patch.layoutMode = args.layoutMode;
    if (args.voiceoverMode !== undefined) {
      patch.voiceoverMode = args.voiceoverMode;
    }
    await ctx.db.patch(args.clipProjectId, patch);
    return args.clipProjectId;
  },
});

/**
 * Relance le rendu de tous les clips avec les options actuelles du projet.
 */
export const rerenderAll = mutation({
  args: { clipProjectId: v.id("clipProjects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    if (!project.sourceVideoUrl) {
      throw new Error("Vidéo source absente");
    }

    const clips = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    if (clips.length === 0) {
      throw new Error("Aucun clip à re-rendre");
    }

    const now = Date.now();
    const transcript = project.transcript;

    // Annuler jobs render encore actifs
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    for (const job of jobs) {
      if (
        job.type === "render_clip" &&
        (job.status === "pending" || job.status === "processing")
      ) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Annulé pour re-rendu",
          updatedAt: now,
        });
      }
    }

    for (const clip of clips) {
      await ctx.db.patch(clip._id, {
        status: "rendering",
        errorMessage: undefined,
        resultUrl: undefined,
      });
      await ctx.db.insert("generationJobs", {
        type: "render_clip",
        clipProjectId: args.clipProjectId,
        clipId: clip._id,
        status: "pending",
        provider: "local",
        payload: {
          sourceVideoUrl: project.sourceVideoUrl,
          youtubeUrl: project.sourceYoutubeUrl,
          startSec: clip.startSec,
          endSec: clip.endSec,
          captionText: clip.captionText ?? "",
          captionSegments: sliceCaptionSegments(
            transcript,
            clip.startSec,
            clip.endSec,
          ),
          brollCues: [],
          captionStyle: project.captionStyle ?? "viral",
          layoutMode: project.layoutMode ?? "smart",
          voiceoverMode: project.voiceoverMode ?? "off",
          title: clip.title,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.clipProjectId, {
      status: "rendering",
      errorMessage: undefined,
    });

    return clips.length;
  },
});

const MIN_MANUAL_CLIP_SEC = 3;
const MAX_MANUAL_CLIP_SEC = 90;

/**
 * Crée un clip manuel (In/Out) et enqueue le rendu 9:16.
 */
export const createManualClip = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    startSec: v.number(),
    endSec: v.number(),
    title: v.optional(v.string()),
  },
  returns: v.id("clips"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    if (!project.sourceVideoUrl) {
      throw new Error("Vidéo source absente — attends la fin du téléchargement");
    }

    const startSec = Math.max(0, args.startSec);
    const endSec = Math.max(startSec, args.endSec);
    const duration = endSec - startSec;
    if (duration < MIN_MANUAL_CLIP_SEC) {
      throw new Error(`Séquence trop courte (min ${MIN_MANUAL_CLIP_SEC}s)`);
    }
    if (duration > MAX_MANUAL_CLIP_SEC) {
      throw new Error(`Séquence trop longue (max ${MAX_MANUAL_CLIP_SEC}s)`);
    }
    if (
      project.durationSeconds != null &&
      startSec >= project.durationSeconds
    ) {
      throw new Error("Le début dépasse la durée de la source");
    }

    const existing = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    const order =
      existing.reduce((max, c) => Math.max(max, c.order), 0) + 1;

    const segments = sliceCaptionSegments(
      project.transcript,
      startSec,
      endSec,
    );
    const captionText = segments
      .map((s) => s.text)
      .join(" ")
      .trim();

    const title =
      args.title?.trim() ||
      `Manuel ${Math.floor(startSec / 60)}:${String(Math.floor(startSec % 60)).padStart(2, "0")}`;

    const now = Date.now();
    const clipId = await ctx.db.insert("clips", {
      clipProjectId: args.clipProjectId,
      order,
      title,
      hookReason: "Sélection manuelle",
      startSec,
      endSec,
      captionText: captionText || undefined,
      status: "rendering",
      createdAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "render_clip",
      clipProjectId: args.clipProjectId,
      clipId,
      status: "pending",
      provider: "local",
      payload: {
        sourceVideoUrl: project.sourceVideoUrl,
        youtubeUrl: project.sourceYoutubeUrl,
        startSec,
        endSec,
        captionText: captionText || "",
        captionSegments: segments,
        brollCues: [],
        captionStyle: project.captionStyle ?? "viral",
        layoutMode: project.layoutMode ?? "smart",
        voiceoverMode: project.voiceoverMode ?? "off",
        title,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.clipProjectId, {
      status: "rendering",
      errorMessage: undefined,
    });

    return clipId;
  },
});

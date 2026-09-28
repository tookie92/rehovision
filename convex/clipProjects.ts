import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

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

export const listMine = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(clipProjectDoc),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const rows = await ctx.db
      .query("clipProjects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, limit);
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

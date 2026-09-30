import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { sliceCaptionSegments } from "./lib/captionSegments";

const punchEffectValidator = v.optional(
  v.union(
    v.literal("off"),
    v.literal("zoom"),
    v.literal("flash"),
    v.literal("grain"),
  ),
);
const lookFilterValidator = v.optional(
  v.union(
    v.literal("off"),
    v.literal("warm"),
    v.literal("cool"),
    v.literal("contrast"),
    v.literal("soft_grain"),
    v.literal("lut"),
  ),
);
const captionStyleValidator = v.optional(
  v.union(
    v.literal("off"),
    v.literal("viral"),
    v.literal("bold_green"),
    v.literal("yellow_pop"),
    v.literal("minimal"),
    v.literal("neon_pink"),
    v.literal("impact"),
  ),
);
const logoCornerValidator = v.optional(
  v.union(
    v.literal("tl"),
    v.literal("tr"),
    v.literal("bl"),
    v.literal("br"),
  ),
);

const splitFocusPaneValidator = v.object({
  cx: v.number(),
  cy: v.number(),
  zoom: v.number(),
});

function clampSplitFocus(p: {
  cx: number;
  cy: number;
  zoom: number;
}): { cx: number; cy: number; zoom: number } {
  return {
    cx: Math.min(0.92, Math.max(0.08, p.cx)),
    cy: Math.min(0.85, Math.max(0.12, p.cy)),
    zoom: Math.min(2.5, Math.max(1, p.zoom)),
  };
}

const viralProjectFields = {
  lookFilter: lookFilterValidator,
  lutStorageId: v.optional(v.id("_storage")),
  lutUrl: v.optional(v.string()),
  punchEffect: punchEffectValidator,
  logoStorageId: v.optional(v.id("_storage")),
  logoUrl: v.optional(v.string()),
  logoCorner: logoCornerValidator,
  logoOpacity: v.optional(v.number()),
  musicStorageId: v.optional(v.id("_storage")),
  musicUrl: v.optional(v.string()),
  musicVolume: v.optional(v.number()),
};

function viralPayload(project: Doc<"clipProjects">) {
  return {
    lookFilter: project.lookFilter ?? "off",
    lutUrl: project.lutUrl,
    punchEffect: project.punchEffect ?? "off",
    logoUrl: project.logoUrl,
    logoCorner: project.logoCorner ?? "br",
    logoOpacity: project.logoOpacity ?? 0.85,
    musicUrl: project.musicUrl,
    musicVolume: project.musicVolume ?? 0.18,
    splitSwap: project.splitSwap ?? false,
    splitFocusTop: project.splitFocusTop,
    splitFocusBot: project.splitFocusBot,
  };
}

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
  sourceLocalFileId: v.optional(v.string()),
  sourceYoutubeUrl: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  transcript: v.optional(v.any()),
  captionStyle: captionStyleValidator,
  layoutMode: v.optional(
    v.union(
      v.literal("smart"),
      v.literal("fill"),
      v.literal("fit"),
      v.literal("split"),
    ),
  ),
  splitSwap: v.optional(v.boolean()),
  splitFocusTop: v.optional(splitFocusPaneValidator),
  splitFocusBot: v.optional(splitFocusPaneValidator),
  voiceoverMode: v.optional(
    v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
  ),
  audioEnhance: v.optional(
    v.union(v.literal("off"), v.literal("light")),
  ),
  ...viralProjectFields,
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
  viralScore: v.optional(v.number()),
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

const stitchedReelDoc = v.object({
  _id: v.id("stitchedReels"),
  _creationTime: v.number(),
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
});

const MIN_STITCH_CLIPS = 2;
const MAX_STITCH_CLIPS = 3;

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
 * Import fichier déjà uploadé sur le disque worker (évite Convex pour gros vlogs).
 */
export const createFromLocalUpload = mutation({
  args: {
    title: v.string(),
    localFileId: v.string(),
    /** URL HTTP worker /media/{id} pour preview navigateur. */
    mediaUrl: v.string(),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim() || "Sans titre";
    const localFileId = args.localFileId.trim();
    const mediaUrl = args.mediaUrl.trim();
    if (!localFileId || !mediaUrl) {
      throw new Error("Fichier local invalide");
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("clipProjects", {
      userId,
      title,
      status: "transcribing",
      sourceLocalFileId: localFileId,
      sourceVideoUrl: mediaUrl,
      durationSeconds: args.durationSeconds,
      createdAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "transcribe",
      clipProjectId: projectId,
      status: "pending",
      provider: "local",
      payload: {
        localFileId,
        sourceVideoUrl: mediaUrl,
        language: "auto",
      },
      createdAt: now,
      updatedAt: now,
    });

    return projectId;
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
  sourceLocalFileId: v.optional(v.string()),
  sourceYoutubeUrl: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  transcript: v.optional(v.any()),
  captionStyle: captionStyleValidator,
  layoutMode: v.optional(
    v.union(
      v.literal("smart"),
      v.literal("fill"),
      v.literal("fit"),
      v.literal("split"),
    ),
  ),
  splitSwap: v.optional(v.boolean()),
  splitFocusTop: v.optional(splitFocusPaneValidator),
  splitFocusBot: v.optional(splitFocusPaneValidator),
  voiceoverMode: v.optional(
    v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
  ),
  audioEnhance: v.optional(
    v.union(v.literal("off"), v.literal("light")),
  ),
  ...viralProjectFields,
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
      stitches: v.array(stitchedReelDoc),
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

    const stitches = await ctx.db
      .query("stitchedReels")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    stitches.sort((a, b) => b.createdAt - a.createdAt);

    return { project, clips, stitches };
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
          youtubeUrl: project.sourceYoutubeUrl,
          localFileId: project.sourceLocalFileId,
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
          audioEnhance: project.audioEnhance ?? "off",
          ...viralPayload(project),
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
 * Met à jour les options de rendu (captions / layout / voiceover / audio).
 */
export const updateRenderOptions = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    captionStyle: captionStyleValidator,
    layoutMode: v.optional(
      v.union(
        v.literal("smart"),
        v.literal("fill"),
        v.literal("fit"),
        v.literal("split"),
      ),
    ),
    splitSwap: v.optional(v.boolean()),
    splitFocusTop: v.optional(splitFocusPaneValidator),
    splitFocusBot: v.optional(splitFocusPaneValidator),
    clearSplitFocus: v.optional(v.boolean()),
    voiceoverMode: v.optional(
      v.union(v.literal("off"), v.literal("mix"), v.literal("replace")),
    ),
    audioEnhance: v.optional(
      v.union(v.literal("off"), v.literal("light")),
    ),
    lookFilter: lookFilterValidator,
    punchEffect: punchEffectValidator,
    logoCorner: logoCornerValidator,
    logoOpacity: v.optional(v.number()),
    musicVolume: v.optional(v.number()),
    clearLogo: v.optional(v.boolean()),
    clearMusic: v.optional(v.boolean()),
    clearLut: v.optional(v.boolean()),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    const patch: Record<string, unknown> = {};
    if (args.captionStyle !== undefined) patch.captionStyle = args.captionStyle;
    if (args.layoutMode !== undefined) patch.layoutMode = args.layoutMode;
    if (args.splitSwap !== undefined) patch.splitSwap = args.splitSwap;
    if (args.clearSplitFocus) {
      patch.splitFocusTop = undefined;
      patch.splitFocusBot = undefined;
    } else {
      if (args.splitFocusTop !== undefined) {
        patch.splitFocusTop = clampSplitFocus(args.splitFocusTop);
      }
      if (args.splitFocusBot !== undefined) {
        patch.splitFocusBot = clampSplitFocus(args.splitFocusBot);
      }
    }
    if (args.voiceoverMode !== undefined) {
      patch.voiceoverMode = args.voiceoverMode;
    }
    if (args.audioEnhance !== undefined) {
      patch.audioEnhance = args.audioEnhance;
    }
    if (args.lookFilter !== undefined) {
      patch.lookFilter = args.lookFilter;
      // Preset ≠ LUT custom : on retire la .cube pour éviter un double look
      if (args.lookFilter !== "lut") {
        patch.lutUrl = undefined;
        patch.lutStorageId = undefined;
      }
    }
    if (args.punchEffect !== undefined) patch.punchEffect = args.punchEffect;
    if (args.logoCorner !== undefined) patch.logoCorner = args.logoCorner;
    if (args.logoOpacity !== undefined) patch.logoOpacity = args.logoOpacity;
    if (args.musicVolume !== undefined) patch.musicVolume = args.musicVolume;
    if (args.clearLogo) {
      patch.logoUrl = undefined;
      patch.logoStorageId = undefined;
    }
    if (args.clearMusic) {
      patch.musicUrl = undefined;
      patch.musicStorageId = undefined;
    }
    if (args.clearLut) {
      patch.lutUrl = undefined;
      patch.lutStorageId = undefined;
      if (project.lookFilter === "lut") {
        patch.lookFilter = "off";
      }
    }
    await ctx.db.patch(args.clipProjectId, patch);
    return args.clipProjectId;
  },
});

/**
 * Attache un logo PNG/JPG au projet (stockage Convex — petit fichier).
 */
export const setLogoAsset = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    storageId: v.id("_storage"),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Logo introuvable");
    await ctx.db.patch(args.clipProjectId, {
      logoStorageId: args.storageId,
      logoUrl: url,
      logoCorner: project.logoCorner ?? "br",
      logoOpacity: project.logoOpacity ?? 0.85,
    });
    return args.clipProjectId;
  },
});

/**
 * Attache un bed musical (mp3/wav) au projet.
 */
export const setMusicAsset = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    storageId: v.id("_storage"),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Musique introuvable");
    await ctx.db.patch(args.clipProjectId, {
      musicStorageId: args.storageId,
      musicUrl: url,
      musicVolume: project.musicVolume ?? 0.18,
    });
    return args.clipProjectId;
  },
});

/**
 * Attache une LUT .cube (DaVinci / Resolve) — appliquée au re-rendu via lut3d.
 */
export const setLutAsset = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    storageId: v.id("_storage"),
  },
  returns: v.id("clipProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("LUT introuvable");
    await ctx.db.patch(args.clipProjectId, {
      lutStorageId: args.storageId,
      lutUrl: url,
      lookFilter: "lut",
    });
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

    return await enqueueClipRenders(ctx, project, clips);
  },
});

/**
 * Re-rend uniquement les clips sélectionnés (multi-select atelier).
 */
export const rerenderClips = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    clipIds: v.array(v.id("clips")),
  },
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
    if (args.clipIds.length === 0) {
      throw new Error("Aucun clip sélectionné");
    }

    const all = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    const idSet = new Set(args.clipIds);
    const clips = all.filter((c) => idSet.has(c._id));
    if (clips.length === 0) {
      throw new Error("Clips introuvables");
    }

    return await enqueueClipRenders(ctx, project, clips, {
      cancelOnlySelected: true,
    });
  },
});

async function enqueueClipRenders(
  ctx: import("./_generated/server").MutationCtx,
  project: Doc<"clipProjects">,
  clips: Doc<"clips">[],
  opts?: { cancelOnlySelected?: boolean },
): Promise<number> {
  const now = Date.now();
  const transcript = project.transcript;
  const selectedIds = new Set(clips.map((c) => c._id));

  const jobs = await ctx.db
    .query("generationJobs")
    .withIndex("by_clipProjectId", (q) =>
      q.eq("clipProjectId", project._id),
    )
    .collect();
  for (const job of jobs) {
    if (
      job.type === "render_clip" &&
      (job.status === "pending" || job.status === "processing")
    ) {
      if (
        opts?.cancelOnlySelected &&
        job.clipId &&
        !selectedIds.has(job.clipId)
      ) {
        continue;
      }
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
      clipProjectId: project._id,
      clipId: clip._id,
      status: "pending",
      provider: "local",
      payload: {
        sourceVideoUrl: project.sourceVideoUrl,
        youtubeUrl: project.sourceYoutubeUrl,
        localFileId: project.sourceLocalFileId,
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
        audioEnhance: project.audioEnhance ?? "off",
        ...viralPayload(project),
        title: clip.title,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  await ctx.db.patch(project._id, {
    status: "rendering",
    errorMessage: undefined,
  });

  return clips.length;
}

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
        localFileId: project.sourceLocalFileId,
        startSec,
        endSec,
        captionText: captionText || "",
        captionSegments: segments,
        brollCues: [],
        captionStyle: project.captionStyle ?? "viral",
        layoutMode: project.layoutMode ?? "smart",
        voiceoverMode: project.voiceoverMode ?? "off",
        audioEnhance: project.audioEnhance ?? "off",
        ...viralPayload(project),
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

const MIN_CLIP_SEC = 3;
const MAX_CLIP_SEC = 90;

/**
 * Ajuste In/Out d’un clip existant et re-rend uniquement celui-ci.
 */
export const updateClipTrim = mutation({
  args: {
    clipId: v.id("clips"),
    startSec: v.number(),
    endSec: v.number(),
  },
  returns: v.id("clips"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip introuvable");
    const project = await ctx.db.get(clip.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Clip introuvable");
    }
    if (!project.sourceVideoUrl && !project.sourceLocalFileId) {
      throw new Error("Vidéo source absente");
    }

    const startSec = Math.max(0, args.startSec);
    const endSec = Math.max(startSec, args.endSec);
    const duration = endSec - startSec;
    if (duration < MIN_CLIP_SEC) {
      throw new Error(`Séquence trop courte (min ${MIN_CLIP_SEC}s)`);
    }
    if (duration > MAX_CLIP_SEC) {
      throw new Error(`Séquence trop longue (max ${MAX_CLIP_SEC}s)`);
    }

    const segments = sliceCaptionSegments(
      project.transcript,
      startSec,
      endSec,
    );
    const captionText = segments
      .map((s) => s.text)
      .join(" ")
      .trim();

    const now = Date.now();
    await ctx.db.patch(args.clipId, {
      startSec,
      endSec,
      captionText: captionText || clip.captionText,
      status: "rendering",
      errorMessage: undefined,
      resultUrl: undefined,
    });

    // Annuler jobs render actifs pour ce clip
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", clip.clipProjectId),
      )
      .collect();
    for (const job of jobs) {
      if (
        job.clipId === args.clipId &&
        job.type === "render_clip" &&
        (job.status === "pending" || job.status === "processing")
      ) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Annulé pour trim",
          updatedAt: now,
        });
      }
    }

    await ctx.db.insert("generationJobs", {
      type: "render_clip",
      clipProjectId: clip.clipProjectId,
      clipId: args.clipId,
      status: "pending",
      provider: "local",
      payload: {
        sourceVideoUrl: project.sourceVideoUrl,
        youtubeUrl: project.sourceYoutubeUrl,
        localFileId: project.sourceLocalFileId,
        startSec,
        endSec,
        captionText: captionText || clip.captionText || "",
        captionSegments: segments,
        brollCues: [],
        captionStyle: project.captionStyle ?? "viral",
        layoutMode: project.layoutMode ?? "smart",
        voiceoverMode: project.voiceoverMode ?? "off",
        audioEnhance: project.audioEnhance ?? "off",
        ...viralPayload(project),
        title: clip.title,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(clip.clipProjectId, {
      status: "rendering",
      errorMessage: undefined,
    });

    return args.clipId;
  },
});

/**
 * Étape 7 — assemble 2–3 clips ready en un seul reel 9:16 (hard cuts).
 * Ordre = ordre du tableau clipIds (sélection atelier).
 */
export const stitchClips = mutation({
  args: {
    clipProjectId: v.id("clipProjects"),
    clipIds: v.array(v.id("clips")),
    title: v.optional(v.string()),
  },
  returns: v.id("stitchedReels"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.clipProjectId);
    if (!project || project.userId !== userId) {
      throw new Error("Projet introuvable");
    }
    if (
      args.clipIds.length < MIN_STITCH_CLIPS ||
      args.clipIds.length > MAX_STITCH_CLIPS
    ) {
      throw new Error(
        `Sélectionne ${MIN_STITCH_CLIPS} à ${MAX_STITCH_CLIPS} clips prêts`,
      );
    }

    const all = await ctx.db
      .query("clips")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    const byId = new Map(all.map((c) => [c._id, c]));
    const ordered: Doc<"clips">[] = [];
    for (const id of args.clipIds) {
      const clip = byId.get(id);
      if (!clip) throw new Error("Clip introuvable");
      if (clip.status !== "ready" || !clip.resultUrl) {
        throw new Error(`« ${clip.title} » n’est pas prêt à assembler`);
      }
      ordered.push(clip);
    }

    const now = Date.now();
    const durationSeconds = ordered.reduce(
      (sum, c) => sum + Math.max(0, c.endSec - c.startSec),
      0,
    );
    const title =
      args.title?.trim() ||
      `Assemblage ${ordered.length} clips · ${project.title}`.slice(0, 80);

    // Annuler stitches encore en file sur ce projet
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_clipProjectId", (q) =>
        q.eq("clipProjectId", args.clipProjectId),
      )
      .collect();
    for (const job of jobs) {
      if (
        job.type === "stitch_clips" &&
        (job.status === "pending" || job.status === "processing")
      ) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Annulé pour nouvel assemblage",
          updatedAt: now,
        });
        const payload = job.payload as { stitchedReelId?: string } | null;
        if (payload?.stitchedReelId) {
          await ctx.db.patch(payload.stitchedReelId as never, {
            status: "failed",
            errorMessage: "Annulé pour nouvel assemblage",
          });
        }
      }
    }

    const reelId = await ctx.db.insert("stitchedReels", {
      clipProjectId: args.clipProjectId,
      userId,
      clipIds: ordered.map((c) => c._id),
      title,
      status: "rendering",
      durationSeconds,
      createdAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "stitch_clips",
      clipProjectId: args.clipProjectId,
      status: "pending",
      provider: "local",
      payload: {
        stitchedReelId: reelId,
        title,
        clipUrls: ordered.map((c) => c.resultUrl!),
        clipTitles: ordered.map((c) => c.title),
        expectedDurationSec: durationSeconds,
      },
      createdAt: now,
      updatedAt: now,
    });

    return reelId;
  },
});

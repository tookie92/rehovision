import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { getScriptSystemPrompt } from "./lib/genrePrompt";
import { buildScriptUserPrompt } from "./lib/scriptPrompt";
import { buildImagePrompt } from "./lib/imagePrompt";
import { bumpUsage, checkUsageLimit, checkStudioLimit } from "./usage";
import { DEFAULT_STUDIO, DEFAULT_STUDIO_NAME } from "./lib/studioDefaults";
import { getFacelessLook, getFacelessVoice } from "./lib/facelessPresets";
import { enqueueAssetJobsForProject } from "./lib/enqueueAssets";
import type { Id } from "./_generated/dataModel";

const projectStatus = v.union(
  v.literal("draft"),
  v.literal("script_ready"),
  v.literal("generating"),
  v.literal("ready"),
  v.literal("exported"),
);

const sceneDoc = v.object({
  _id: v.id("scenes"),
  _creationTime: v.number(),
  videoProjectId: v.id("videoProjects"),
  order: v.number(),
  narrationText: v.string(),
  visualBeat: v.optional(v.string()),
  imagePrompt: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  audioUrl: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
});

const projectDoc = v.object({
  _id: v.id("videoProjects"),
  _creationTime: v.number(),
  studioId: v.id("studios"),
  title: v.string(),
  topic: v.string(),
  status: projectStatus,
  lookId: v.optional(v.string()),
  voiceId: v.optional(v.string()),
  autoGenerateAssets: v.optional(v.boolean()),
  finalVideoUrl: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * Crée un projet vidéo en brouillon (après contrôle de quota).
 */
export const createVideoProject = mutation({
  args: {
    studioId: v.id("studios"),
    title: v.string(),
    topic: v.string(),
    planSlug: v.optional(v.string()),
  },
  returns: v.id("videoProjects"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Studio introuvable");
    }

    await checkUsageLimit(ctx, userId, args.planSlug ?? "solo");

    const projectId = await ctx.db.insert("videoProjects", {
      studioId: args.studioId,
      title: args.title.trim(),
      topic: args.topic.trim(),
      status: "draft",
      createdAt: Date.now(),
    });

    await bumpUsage(ctx, userId, { videosGenerated: 1 });

    return projectId;
  },
});

/**
 * Flux sujet → reel : look + voix choisis avant génération.
 */
export const createAndStartReel = mutation({
  args: {
    topic: v.string(),
    lookId: v.optional(v.string()),
    voiceId: v.optional(v.string()),
    planSlug: v.optional(v.string()),
  },
  returns: v.object({
    projectId: v.id("videoProjects"),
    studioId: v.id("studios"),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const topic = args.topic.trim();
    if (!topic) throw new Error("Sujet vide");

    await checkUsageLimit(ctx, userId, args.planSlug ?? "solo");

    const look = getFacelessLook(args.lookId);
    const voice = getFacelessVoice(args.voiceId);

    const studios = await ctx.db
      .query("studios")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Studio dédié à ce reel (évite de polluer les autres projets)
    let studioId: Id<"studios"> | undefined;
    try {
      await checkStudioLimit(ctx, userId, args.planSlug ?? "solo");
      studioId = await ctx.db.insert("studios", {
        userId,
        name: `${look.label} · ${topic.slice(0, 36)}`,
        visualStyle: look.prompt,
        narrationTone: look.toneHint,
        voiceInstruct: voice.instruct,
        genre: look.genre,
        createdAt: Date.now(),
      });
    } catch {
      // Quota studios : réutilise / met à jour le Défaut
      studioId = studios.find((s) => s.name === DEFAULT_STUDIO_NAME)?._id;
      if (!studioId && studios.length > 0) {
        studioId = studios[0]!._id;
      }
      if (!studioId) {
        studioId = await ctx.db.insert("studios", {
          userId,
          name: DEFAULT_STUDIO.name,
          visualStyle: look.prompt,
          narrationTone: look.toneHint,
          voiceInstruct: voice.instruct,
          genre: look.genre,
          createdAt: Date.now(),
        });
      } else {
        await ctx.db.patch(studioId, {
          visualStyle: look.prompt,
          narrationTone: look.toneHint,
          voiceInstruct: voice.instruct,
          genre: look.genre,
        });
      }
    }

    const studio = await ctx.db.get(studioId);
    if (!studio) throw new Error("Studio introuvable");

    const now = Date.now();
    const projectId = await ctx.db.insert("videoProjects", {
      studioId,
      title: topic,
      topic,
      status: "draft",
      lookId: look.id,
      voiceId: voice.id,
      autoGenerateAssets: true,
      createdAt: now,
    });

    await bumpUsage(ctx, userId, { videosGenerated: 1 });

    const systemPrompt = getScriptSystemPrompt(look.genre);
    const userPrompt = buildScriptUserPrompt({
      topic,
      title: topic,
      narrationTone: look.toneHint,
      visualStyle: look.prompt,
      genre: look.genre,
    });

    await ctx.db.insert("generationJobs", {
      type: "script",
      videoProjectId: projectId,
      status: "pending",
      provider: "local",
      payload: {
        systemPrompt,
        userPrompt,
        visualStyle: look.prompt,
        narrationTone: look.toneHint,
        voiceInstruct: voice.instruct,
        genre: look.genre,
        topic,
        title: topic,
      },
      createdAt: now,
      updatedAt: now,
    });

    return { projectId, studioId };
  },
});

/**
 * Projets récents de l'utilisateur (tous studios), pour le dashboard.
 */
export const getRecentProjects = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      project: projectDoc,
      studioName: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const studios = await ctx.db
      .query("studios")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const studioMap = new Map(studios.map((s) => [s._id, s.name]));

    const all = [];
    for (const studio of studios) {
      const projects = await ctx.db
        .query("videoProjects")
        .withIndex("by_studioId", (q) => q.eq("studioId", studio._id))
        .order("desc")
        .take(limit);
      for (const project of projects) {
        all.push({
          project,
          studioName: studioMap.get(studio._id) ?? studio.name,
        });
      }
    }

    all.sort((a, b) => b.project.createdAt - a.project.createdAt);
    return all.slice(0, limit);
  },
});

/**
 * Liste les projets d'un Studio.
 */
export const getVideoProjectsByStudio = query({
  args: { studioId: v.id("studios") },
  returns: v.array(projectDoc),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("videoProjects")
      .withIndex("by_studioId", (q) => q.eq("studioId", args.studioId))
      .order("desc")
      .collect();
  },
});

/**
 * Projet + scènes (temps réel via useQuery côté client).
 */
export const getVideoProjectWithScenes = query({
  args: { projectId: v.id("videoProjects") },
  returns: v.union(
    v.object({
      project: projectDoc,
      scenes: v.array(sceneDoc),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) return null;

    const scenes = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.projectId),
      )
      .collect();

    scenes.sort((a, b) => a.order - b.order);

    return { project, scenes };
  },
});

/**
 * File un job "script" pour le worker Ollama local (pas d'API cloud).
 */
export const generateScript = mutation({
  args: { projectId: v.id("videoProjects") },
  returns: v.object({ jobId: v.id("generationJobs") }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    if (project.status !== "draft" && project.status !== "script_ready") {
      throw new Error(
        `Impossible de générer un script depuis le statut ${project.status}`,
      );
    }

    // Jobs script bloqués (worker arrêté) → on les annule pour permettre un retry
    const existingJobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.projectId),
      )
      .collect();

    const now = Date.now();
    for (const job of existingJobs) {
      if (
        job.type === "script" &&
        (job.status === "pending" || job.status === "processing")
      ) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Remplacé par une nouvelle génération",
          updatedAt: now,
        });
      }
    }

    const systemPrompt = getScriptSystemPrompt(studio.genre);
    const userPrompt = buildScriptUserPrompt({
      topic: project.topic,
      title: project.title,
      narrationTone: studio.narrationTone,
      visualStyle: studio.visualStyle,
      genre: studio.genre ?? "true_crime",
    });

    const jobId = await ctx.db.insert("generationJobs", {
      type: "script",
      videoProjectId: args.projectId,
      status: "pending",
      provider: "local",
      payload: {
        systemPrompt,
        userPrompt,
        visualStyle: studio.visualStyle,
        narrationTone: studio.narrationTone,
        genre: studio.genre ?? "true_crime",
        topic: project.topic,
        title: project.title,
      },
      createdAt: now,
      updatedAt: now,
    });

    return { jobId };
  },
});

/**
 * Met à jour narration / prompt image d'une scène (révision script).
 * Invalide image/audio si le texte change.
 */
export const updateScene = mutation({
  args: {
    sceneId: v.id("scenes"),
    narrationText: v.optional(v.string()),
    imagePrompt: v.optional(v.string()),
  },
  returns: v.id("scenes"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scene = await ctx.db.get(args.sceneId);
    if (!scene) throw new Error("Scène introuvable");

    const project = await ctx.db.get(scene.videoProjectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    const patch: {
      narrationText?: string;
      imagePrompt?: string;
      imageUrl?: undefined;
      audioUrl?: undefined;
      durationSeconds?: undefined;
    } = {};

    let invalidateAssets = false;

    if (args.narrationText !== undefined) {
      const next = args.narrationText.trim();
      if (!next) throw new Error("Narration vide");
      if (next !== scene.narrationText) {
        patch.narrationText = next;
        invalidateAssets = true;
      }
    }

    if (args.imagePrompt !== undefined) {
      const next = args.imagePrompt.trim();
      if (next !== (scene.imagePrompt ?? "")) {
        patch.imagePrompt = next;
        invalidateAssets = true;
      }
    }

    if (invalidateAssets) {
      patch.imageUrl = undefined;
      patch.audioUrl = undefined;
      patch.durationSeconds = undefined;
      if (project.status === "ready" || project.status === "generating") {
        await ctx.db.patch(project._id, {
          status: "script_ready",
          finalVideoUrl: undefined,
        });
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.sceneId, patch);
    }

    return args.sceneId;
  },
});

/**
 * Supprime une scène et réordonne les suivantes.
 */
export const deleteScene = mutation({
  args: { sceneId: v.id("scenes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scene = await ctx.db.get(args.sceneId);
    if (!scene) throw new Error("Scène introuvable");

    const project = await ctx.db.get(scene.videoProjectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    const siblings = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", scene.videoProjectId),
      )
      .collect();

    if (siblings.length <= 1) {
      throw new Error("Garde au moins une scène");
    }

    await ctx.db.delete(args.sceneId);

    const remaining = siblings
      .filter((s) => s._id !== args.sceneId)
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < remaining.length; i++) {
      await ctx.db.patch(remaining[i]._id, { order: i + 1 });
    }

    if (project.status === "ready" || project.status === "generating") {
      await ctx.db.patch(project._id, {
        status: "script_ready",
        finalVideoUrl: undefined,
      });
    }

    return null;
  },
});

/**
 * File image et/ou voix pour une seule scène.
 */
export const queueSceneJobs = mutation({
  args: {
    sceneId: v.id("scenes"),
    kinds: v.array(
      v.union(v.literal("image"), v.literal("voiceover")),
    ),
  },
  returns: v.object({ jobCount: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const scene = await ctx.db.get(args.sceneId);
    if (!scene) throw new Error("Scène introuvable");

    const project = await ctx.db.get(scene.videoProjectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    if (args.kinds.length === 0) {
      throw new Error("Aucune génération demandée");
    }

    const now = Date.now();
    let jobCount = 0;

    // Annule jobs actifs de même type pour cette scène
    const existing = await ctx.db
      .query("generationJobs")
      .withIndex("by_sceneId", (q) => q.eq("sceneId", args.sceneId))
      .collect();

    for (const job of existing) {
      if (
        args.kinds.includes(job.type as "image" | "voiceover") &&
        (job.status === "pending" || job.status === "processing")
      ) {
        await ctx.db.patch(job._id, {
          status: "failed",
          errorMessage: "Remplacé par une nouvelle génération",
          updatedAt: now,
        });
      }
    }

    if (args.kinds.includes("image")) {
      const beat =
        scene.visualBeat?.trim() || scene.narrationText;
      const hasRef = Boolean(studio.referenceImageUrl);
      // Toujours le style studio courant (chips Style) — pas l’ancien imagePrompt.
      const prompt = buildImagePrompt({
        visualBeat: beat,
        visualStyle: studio.visualStyle,
        narrationTone: studio.narrationTone,
        topic: project.topic,
        hasStyleReference: hasRef,
      });
      await ctx.db.patch(scene._id, { imagePrompt: prompt });

      await ctx.db.insert("generationJobs", {
        type: "image",
        sceneId: scene._id,
        videoProjectId: project._id,
        status: "pending",
        provider: "local",
        payload: {
          prompt,
          visualStyle: studio.visualStyle,
          referenceImageUrl: studio.referenceImageUrl,
        },
        createdAt: now,
        updatedAt: now,
      });
      jobCount += 1;
      await bumpUsage(ctx, userId, { imagesGenerated: 1 });
    }

    if (args.kinds.includes("voiceover")) {
      const voiceInstruct =
        studio.voiceInstruct ??
        (project.voiceId
          ? getFacelessVoice(project.voiceId).instruct
          : studio.narrationTone);
      await ctx.db.insert("generationJobs", {
        type: "voiceover",
        sceneId: scene._id,
        videoProjectId: project._id,
        status: "pending",
        provider: "local",
        payload: {
          text: scene.narrationText,
          tone: studio.narrationTone,
          voiceInstruct,
        },
        createdAt: now,
        updatedAt: now,
      });
      jobCount += 1;
    }

    await ctx.db.patch(project._id, {
      status: "generating",
      finalVideoUrl: undefined,
    });

    return { jobCount };
  },
});

/**
 * Remplace les scènes d'un projet par le script LLM et passe en script_ready.
 */
export const applyGeneratedScript = internalMutation({
  args: {
    projectId: v.id("videoProjects"),
    title: v.string(),
    scenes: v.array(
      v.object({
        order: v.number(),
        narrationText: v.string(),
        imagePrompt: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Projet introuvable");

    const existing = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.projectId),
      )
      .collect();

    for (const scene of existing) {
      await ctx.db.delete(scene._id);
    }

    for (const scene of args.scenes) {
      await ctx.db.insert("scenes", {
        videoProjectId: args.projectId,
        order: scene.order,
        narrationText: scene.narrationText,
        imagePrompt: scene.imagePrompt,
      });
    }

    await ctx.db.patch(args.projectId, {
      title: args.title,
      status: "script_ready",
    });

    return null;
  },
});

/**
 * File des jobs image et/ou voiceover pour chaque scène (provider local).
 * `kinds` permet de regenerer seulement les images ou seulement les voix.
 */
export const queueGenerationJobs = mutation({
  args: {
    projectId: v.id("videoProjects"),
    kinds: v.optional(
      v.array(v.union(v.literal("image"), v.literal("voiceover"))),
    ),
  },
  returns: v.object({ jobCount: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    if (
      project.status !== "script_ready" &&
      project.status !== "draft" &&
      project.status !== "generating" &&
      project.status !== "ready" &&
      project.status !== "exported"
    ) {
      throw new Error(
        `Impossible de lancer la génération depuis le statut ${project.status}`,
      );
    }

    const jobCount = await enqueueAssetJobsForProject(ctx, {
      project,
      studio,
      userId,
      kinds: args.kinds,
    });

    return { jobCount };
  },
});

/**
 * Applique un look à tout le projet puis regen toutes les images.
 */
export const applyLookAndRegenImages = mutation({
  args: {
    projectId: v.id("videoProjects"),
    lookId: v.string(),
  },
  returns: v.object({ jobCount: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    const look = getFacelessLook(args.lookId);
    await ctx.db.patch(studio._id, {
      visualStyle: look.prompt,
      narrationTone: look.toneHint,
      genre: look.genre,
    });
    await ctx.db.patch(project._id, { lookId: look.id });

    const updatedProject = (await ctx.db.get(project._id))!;
    const updatedStudio = (await ctx.db.get(studio._id))!;

    const jobCount = await enqueueAssetJobsForProject(ctx, {
      project: updatedProject,
      studio: updatedStudio,
      userId,
      kinds: ["image"],
    });

    return { jobCount };
  },
});

/**
 * Applique une voix à tout le projet puis regen toutes les voiceovers.
 */
export const applyVoiceAndRegen = mutation({
  args: {
    projectId: v.id("videoProjects"),
    voiceId: v.string(),
  },
  returns: v.object({ jobCount: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Projet introuvable");

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Non autorisé");
    }

    const voice = getFacelessVoice(args.voiceId);
    await ctx.db.patch(studio._id, { voiceInstruct: voice.instruct });
    await ctx.db.patch(project._id, { voiceId: voice.id });

    const updatedProject = (await ctx.db.get(project._id))!;
    const updatedStudio = (await ctx.db.get(studio._id))!;

    const jobCount = await enqueueAssetJobsForProject(ctx, {
      project: updatedProject,
      studio: updatedStudio,
      userId,
      kinds: ["voiceover"],
    });

    return { jobCount };
  },
});

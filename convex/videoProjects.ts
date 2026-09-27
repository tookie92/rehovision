import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import {
  SCRIPT_SYSTEM_PROMPT,
  buildScriptUserPrompt,
} from "./lib/scriptPrompt";
import { bumpUsage, checkUsageLimit } from "./usage";

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

    // Compte comme une vidéo générée dès la création (quota mensuel)
    await bumpUsage(ctx, userId, { videosGenerated: 1 });

    return projectId;
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

    const systemPrompt = SCRIPT_SYSTEM_PROMPT;
    const userPrompt = buildScriptUserPrompt({
      topic: project.topic,
      title: project.title,
      narrationTone: studio.narrationTone,
      visualStyle: studio.visualStyle,
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
 * File des jobs image + voiceover pour chaque scène (provider local).
 */
export const queueGenerationJobs = mutation({
  args: { projectId: v.id("videoProjects") },
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
      project.status !== "generating"
    ) {
      throw new Error(
        `Impossible de lancer la génération depuis le statut ${project.status}`,
      );
    }

    const scenes = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.projectId),
      )
      .collect();

    if (scenes.length === 0) {
      throw new Error("Aucune scène — générez d'abord le script");
    }

    const now = Date.now();
    let jobCount = 0;

    for (const scene of scenes) {
      await ctx.db.insert("generationJobs", {
        type: "image",
        sceneId: scene._id,
        videoProjectId: args.projectId,
        status: "pending",
        provider: "local",
        payload: {
          prompt: scene.imagePrompt ?? scene.narrationText,
          visualStyle: studio.visualStyle,
          referenceImageUrl: studio.referenceImageUrl,
        },
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("generationJobs", {
        type: "voiceover",
        sceneId: scene._id,
        videoProjectId: args.projectId,
        status: "pending",
        provider: "local",
        payload: {
          text: scene.narrationText,
          tone: studio.narrationTone,
        },
        createdAt: now,
        updatedAt: now,
      });

      jobCount += 2;
    }

    await ctx.db.patch(args.projectId, { status: "generating" });
    await bumpUsage(ctx, userId, { imagesGenerated: scenes.length });

    return { jobCount };
  },
});

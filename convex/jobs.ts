/**
 * AVERTISSEMENT : Aucune authentification.
 * Ne pas exposer publiquement avant d'avoir ajouté Convex Auth ou équivalent.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertWorkerToken } from "./lib/auth";
import { jobType } from "./schema";
import type { Id } from "./_generated/dataModel";

export const create = mutation({
  args: {
    type: jobType,
    params: v.any(),
    sessionId: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (!args.sessionId || args.sessionId.length < 8) {
      throw new Error("sessionId invalide");
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.sessionId !== args.sessionId) {
        throw new Error("Projet introuvable");
      }
    }
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      type: args.type,
      status: "queued",
      params: args.params,
      sessionId: args.sessionId,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      progress: 0,
      createdAt: now,
    });
    if (args.projectId) {
      await ctx.db.patch(args.projectId, {
        latestJobId: jobId,
        updatedAt: now,
      });
    }
    return jobId;
  },
});

/** Upload navigateur (source audio doublage). Pas d'auth — MVP privé uniquement. */
export const generateUploadUrl = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    if (!args.sessionId || args.sessionId.length < 8) {
      throw new Error("sessionId invalide");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const listBySession = query({
  args: {
    sessionId: v.string(),
    /** Limite récente pour accélérer le chargement UI (défaut 80). */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(Math.max(args.limit ?? 80, 1), 200);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return jobs
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, cap);
  },
});

export const listByProject = query({
  args: {
    sessionId: v.string(),
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.sessionId !== args.sessionId) return [];
    const cap = Math.min(Math.max(args.limit ?? 40, 1), 100);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/** Reset MVP : efface jobs + library (+ fichiers storage liés). */
export const clearAll = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    let jobs = 0;
    let library = 0;
    let files = 0;
    const storageIds = new Set<Id<"_storage">>();

    for (const job of await ctx.db.query("jobs").collect()) {
      if (job.resultStorageId) storageIds.add(job.resultStorageId);
      const p = job.params as { sourceStorageId?: Id<"_storage"> };
      if (p?.sourceStorageId) storageIds.add(p.sourceStorageId);
      await ctx.db.delete(job._id);
      jobs += 1;
    }
    for (const item of await ctx.db.query("library").collect()) {
      storageIds.add(item.storageId);
      await ctx.db.delete(item._id);
      library += 1;
    }
    for (const id of storageIds) {
      try {
        await ctx.storage.delete(id);
        files += 1;
      } catch {
        // ignore missing blobs
      }
    }
    return { jobs, library, files };
  },
});

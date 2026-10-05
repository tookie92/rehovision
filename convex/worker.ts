/**
 * AVERTISSEMENT : Aucune authentification utilisateur.
 * Ces mutations sont protégées par WORKER_TOKEN uniquement.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { assertWorkerToken } from "./lib/auth";

export const claimNextJob = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);

    // Mutation Convex = transaction : en cas de conflit OCC, retry automatique.
    // Deux workers ne peuvent pas claim le même document.
    const next = await ctx.db
      .query("jobs")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();

    if (!next) {
      return null;
    }

    const now = Date.now();
    const resumeProgress =
      typeof next.progress === "number" && next.progress > 1
        ? next.progress
        : next.checkpoint &&
            typeof (next.checkpoint as { nextIndex?: number }).nextIndex ===
              "number"
          ? Math.max(
              1,
              Math.min(
                80,
                20 +
                  Number((next.checkpoint as { nextIndex: number }).nextIndex),
              ),
            )
          : 1;
    await ctx.db.patch(next._id, {
      status: "running",
      startedAt: now,
      progress: resumeProgress,
      error: undefined,
    });

    return await ctx.db.get(next._id);
  },
});

export const updateProgress = mutation({
  args: {
    token: v.string(),
    jobId: v.id("jobs"),
    progress: v.number(),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }
    const progress = Math.max(0, Math.min(100, args.progress));
    await ctx.db.patch(args.jobId, { progress });
  },
});

/** Sauvegarde un checkpoint audiobook (chunks déjà générés). */
export const saveCheckpoint = mutation({
  args: {
    token: v.string(),
    jobId: v.id("jobs"),
    checkpoint: v.any(),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") {
      return;
    }
    const patch: Record<string, unknown> = {
      checkpoint: args.checkpoint,
    };
    if (typeof args.progress === "number") {
      patch.progress = Math.max(0, Math.min(100, args.progress));
    }
    await ctx.db.patch(args.jobId, patch);
  },
});

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const completeJob = mutation({
  args: {
    token: v.string(),
    jobId: v.id("jobs"),
    resultStorageId: v.id("_storage"),
    resultMeta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Job introuvable");
    }
    await ctx.db.patch(args.jobId, {
      status: "done",
      progress: 100,
      resultStorageId: args.resultStorageId,
      ...(args.resultMeta !== undefined ? { resultMeta: args.resultMeta } : {}),
      checkpoint: undefined,
      finishedAt: Date.now(),
      error: undefined,
    });
    if (job.projectId) {
      await ctx.db.patch(job.projectId, {
        latestJobId: args.jobId,
        latestResultStorageId: args.resultStorageId,
        updatedAt: Date.now(),
      });
    }
  },
});

export const failJob = mutation({
  args: {
    token: v.string(),
    jobId: v.id("jobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return;
    }
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      finishedAt: Date.now(),
    });
  },
});

export const reclaimStaleJobs = mutation({
  args: {
    token: v.string(),
    staleMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    // staleMinutes=0 → remet immédiatement tous les jobs "running"
    const cutoff = Date.now() - Math.max(0, args.staleMinutes) * 60_000;
    const running = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    let reclaimed = 0;
    for (const job of running) {
      const started = job.startedAt ?? job.createdAt;
      if (started <= cutoff) {
        // Garde checkpoint + progress pour reprise audiobook (B2)
        const keepProgress =
          typeof job.progress === "number" && job.progress > 0
            ? job.progress
            : undefined;
        await ctx.db.patch(job._id, {
          status: "queued",
          ...(keepProgress !== undefined ? { progress: keepProgress } : {}),
          startedAt: undefined,
          error: job.checkpoint
            ? "Reprise prévue (checkpoint conservé)"
            : "Remis en file (worker redémarré / job orphelin)",
        });
        reclaimed += 1;
      }
    }
    return { reclaimed };
  },
});

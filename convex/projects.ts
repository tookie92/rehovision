/**
 * Projets atelier (doublage, musique, …).
 * Brouillon éditable + lien vers jobs de génération.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { dubDraft, projectKind } from "./schema";

function assertSession(sessionId: string) {
  if (!sessionId || sessionId.length < 8) {
    throw new Error("sessionId invalide");
  }
}

const defaultDubDraft = {
  mode: "narration" as const,
  text: "Bonjour, bienvenue dans notre atelier. Aujourd'hui on parle de création locale.",
  sourceLang: "fr",
  targetLang: "wo",
  voiceMode: "model" as const,
  speed: 1,
  gender: "female",
  age: "young adult",
  pitch: "moderate pitch",
};

export const listBySession = query({
  args: {
    sessionId: v.string(),
    kind: v.optional(projectKind),
    limit: v.optional(v.number()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (!args.sessionId) return [];
    const cap = Math.min(Math.max(args.limit ?? 60, 1), 200);
    let rows;
    if (args.kind) {
      rows = await ctx.db
        .query("projects")
        .withIndex("by_session_kind", (q) =>
          q.eq("sessionId", args.sessionId).eq("kind", args.kind!),
        )
        .collect();
    } else {
      rows = await ctx.db
        .query("projects")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect();
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, cap);
  },
});

export const get = query({
  args: {
    sessionId: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.sessionId !== args.sessionId) return null;
    return project;
  },
});

export const createDub = mutation({
  args: {
    sessionId: v.string(),
    title: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("narration"), v.literal("doublage"))),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const now = Date.now();
    const mode = args.mode ?? "narration";
    const title =
      args.title?.trim() ||
      (mode === "doublage" ? "Nouveau doublage" : "Nouvelle narration");
    return await ctx.db.insert("projects", {
      sessionId: args.sessionId,
      kind: mode === "doublage" ? "dub" : "narration",
      title,
      draft: { ...defaultDubDraft, mode },
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionId: v.string(),
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    draft: v.optional(dubDraft),
    kind: v.optional(v.union(v.literal("dub"), v.literal("narration"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.sessionId !== args.sessionId) {
      throw new Error("Projet introuvable");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const t = args.title.trim();
      if (t) patch.title = t.slice(0, 120);
    }
    if (args.draft !== undefined) {
      patch.draft = args.draft;
      if (args.draft.mode === "doublage") patch.kind = "dub";
      else if (args.draft.mode === "narration") patch.kind = "narration";
    }
    if (args.kind !== undefined) patch.kind = args.kind;
    await ctx.db.patch(args.projectId, patch);
    return null;
  },
});

export const remove = mutation({
  args: {
    sessionId: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.sessionId !== args.sessionId) {
      throw new Error("Projet introuvable");
    }
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const job of jobs) {
      await ctx.db.patch(job._id, { projectId: undefined });
    }
    await ctx.db.delete(args.projectId);
    return null;
  },
});

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { checkStudioLimit } from "./usage";

const studioDoc = v.object({
  _id: v.id("studios"),
  _creationTime: v.number(),
  userId: v.string(),
  name: v.string(),
  visualStyle: v.string(),
  narrationTone: v.string(),
  referenceImageUrl: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * Liste les Studios de l'utilisateur connecté.
 */
export const getStudiosByUser = query({
  args: {},
  returns: v.array(studioDoc),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("studios")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Détail d'un Studio (avec contrôle d'appartenance).
 */
export const getStudio = query({
  args: { studioId: v.id("studios") },
  returns: v.union(studioDoc, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      return null;
    }
    return studio;
  },
});

/**
 * Crée un Studio. `planSlug` sert au quota (défaut solo jusqu'à l'étape Billing).
 */
export const createStudio = mutation({
  args: {
    name: v.string(),
    visualStyle: v.string(),
    narrationTone: v.string(),
    referenceImageUrl: v.optional(v.string()),
    planSlug: v.optional(v.string()),
  },
  returns: v.id("studios"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await checkStudioLimit(ctx, userId, args.planSlug ?? "solo");

    return await ctx.db.insert("studios", {
      userId,
      name: args.name.trim(),
      visualStyle: args.visualStyle.trim(),
      narrationTone: args.narrationTone.trim(),
      referenceImageUrl: args.referenceImageUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Met à jour le nom / style / ton d'un Studio.
 */
export const updateStudio = mutation({
  args: {
    studioId: v.id("studios"),
    name: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    narrationTone: v.optional(v.string()),
    referenceImageUrl: v.optional(v.string()),
  },
  returns: v.id("studios"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Studio introuvable");
    }

    const patch: {
      name?: string;
      visualStyle?: string;
      narrationTone?: string;
      referenceImageUrl?: string;
    } = {};

    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.visualStyle !== undefined) {
      patch.visualStyle = args.visualStyle.trim();
    }
    if (args.narrationTone !== undefined) {
      patch.narrationTone = args.narrationTone.trim();
    }
    if (args.referenceImageUrl !== undefined) {
      patch.referenceImageUrl = args.referenceImageUrl;
    }

    await ctx.db.patch(args.studioId, patch);
    return args.studioId;
  },
});

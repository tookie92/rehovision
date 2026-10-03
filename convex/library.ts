/**
 * AVERTISSEMENT : Aucune authentification.
 * Ne pas exposer publiquement avant d'avoir ajouté Convex Auth ou équivalent.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertWorkerToken } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("library").collect();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Utilisé par le bench worker pour peupler la bibliothèque. */
export const upsertFromWorker = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    mood: v.string(),
    durationS: v.number(),
    storageId: v.id("_storage"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    assertWorkerToken(args.token);
    return await ctx.db.insert("library", {
      title: args.title,
      mood: args.mood,
      durationS: args.durationS,
      storageId: args.storageId,
      prompt: args.prompt,
      createdAt: Date.now(),
    });
  },
});

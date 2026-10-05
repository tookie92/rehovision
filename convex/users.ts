/**
 * Utilisateurs Clerk synchronisés dans Convex.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const store = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId.trim();
    if (!clerkId || clerkId.length < 8) {
      throw new Error("clerkId invalide");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email ?? existing.email,
        name: args.name ?? existing.name,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        lastSeenAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      createdAt: now,
      lastSeenAt: now,
    });
  },
});

export const me = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    if (!args.clerkId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

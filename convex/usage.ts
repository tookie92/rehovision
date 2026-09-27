import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  PLAN_LIMITS,
  PlanSlug,
  currentMonthKey,
  isPlanSlug,
} from "./lib/plans";

/**
 * Quotas du mois courant pour l'utilisateur authentifié.
 */
export const getCurrentUsage = query({
  args: {},
  returns: v.object({
    month: v.string(),
    videosGenerated: v.number(),
    imagesGenerated: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const month = currentMonthKey();

    const row = await ctx.db
      .query("usage")
      .withIndex("by_userId_and_month", (q) =>
        q.eq("userId", userId).eq("month", month),
      )
      .unique();

    return {
      month,
      videosGenerated: row?.videosGenerated ?? 0,
      imagesGenerated: row?.imagesGenerated ?? 0,
    };
  },
});

/**
 * Incrémente la consommation mensuelle (vidéos / images).
 */
export const incrementUsage = mutation({
  args: {
    videosGenerated: v.optional(v.number()),
    imagesGenerated: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await bumpUsage(ctx, userId, {
      videosGenerated: args.videosGenerated ?? 0,
      imagesGenerated: args.imagesGenerated ?? 0,
    });
    return null;
  },
});

/** Incrément interne (appelable depuis d'autres mutations sans re-auth). */
export async function bumpUsage(
  ctx: MutationCtx,
  userId: string,
  delta: { videosGenerated?: number; imagesGenerated?: number },
) {
  const month = currentMonthKey();
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_userId_and_month", (q) =>
      q.eq("userId", userId).eq("month", month),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      videosGenerated:
        existing.videosGenerated + (delta.videosGenerated ?? 0),
      imagesGenerated:
        existing.imagesGenerated + (delta.imagesGenerated ?? 0),
    });
    return;
  }

  await ctx.db.insert("usage", {
    userId,
    month,
    videosGenerated: delta.videosGenerated ?? 0,
    imagesGenerated: delta.imagesGenerated ?? 0,
  });
}

/**
 * Vérifie le quota vidéo du plan avant createVideoProject.
 * `planSlug` sera fourni par le frontend après `auth.has({ plan })` (étape 5).
 */
export async function checkUsageLimit(
  ctx: MutationCtx,
  userId: string,
  planSlug: string = "solo",
): Promise<void> {
  const plan: PlanSlug = isPlanSlug(planSlug) ? planSlug : "solo";
  const limits = PLAN_LIMITS[plan];
  const month = currentMonthKey();

  const usage = await ctx.db
    .query("usage")
    .withIndex("by_userId_and_month", (q) =>
      q.eq("userId", userId).eq("month", month),
    )
    .unique();

  const videosGenerated = usage?.videosGenerated ?? 0;
  if (videosGenerated >= limits.maxVideosPerMonth) {
    throw new Error(
      `Quota mensuel atteint (${limits.maxVideosPerMonth} vidéos pour le plan ${plan})`,
    );
  }
}

/**
 * Vérifie le nombre de Studios autorisés pour le plan.
 */
export async function checkStudioLimit(
  ctx: MutationCtx,
  userId: string,
  planSlug: string = "solo",
): Promise<void> {
  const plan: PlanSlug = isPlanSlug(planSlug) ? planSlug : "solo";
  const limits = PLAN_LIMITS[plan];

  const studios = await ctx.db
    .query("studios")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  if (studios.length >= limits.maxStudios) {
    throw new Error(
      `Limite de Studios atteinte (${limits.maxStudios} pour le plan ${plan})`,
    );
  }
}

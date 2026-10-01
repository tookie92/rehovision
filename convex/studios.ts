import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";
import { checkStudioLimit } from "./usage";
import { isGenreId, normalizeGenre } from "./lib/genrePrompt";
import { DEFAULT_STUDIO, DEFAULT_STUDIO_NAME } from "./lib/studioDefaults";

const genreValidator = v.union(
  v.literal("true_crime"),
  v.literal("kids"),
  v.literal("history"),
  v.literal("custom"),
);

const studioDoc = v.object({
  _id: v.id("studios"),
  _creationTime: v.number(),
  userId: v.string(),
  name: v.string(),
  visualStyle: v.string(),
  narrationTone: v.string(),
  voiceInstruct: v.optional(v.string()),
  genre: v.optional(genreValidator),
  referenceImageUrl: v.optional(v.string()),
  referenceStorageId: v.optional(v.id("_storage")),
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
 * Récupère ou crée le Studio « Défaut » (flux sujet → reel sans config).
 */
export const getOrCreateDefaultStudio = mutation({
  args: { planSlug: v.optional(v.string()) },
  returns: v.id("studios"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("studios")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const namedDefault = existing.find((s) => s.name === DEFAULT_STUDIO_NAME);
    if (namedDefault) return namedDefault._id;
    // Réutilise le studio le plus récent s'il en existe déjà (évite de multiplier)
    if (existing.length > 0) return existing[0]._id;

    await checkStudioLimit(ctx, userId, args.planSlug ?? "solo");

    return await ctx.db.insert("studios", {
      userId,
      name: DEFAULT_STUDIO.name,
      visualStyle: DEFAULT_STUDIO.visualStyle,
      narrationTone: DEFAULT_STUDIO.narrationTone,
      voiceInstruct: DEFAULT_STUDIO.voiceInstruct,
      genre: DEFAULT_STUDIO.genre,
      createdAt: Date.now(),
    });
  },
});

/**
 * URL signée pour uploader une image de référence (Convex file storage).
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
 * Crée un Studio. `planSlug` sert au quota (défaut solo jusqu'à l'étape Billing).
 */
export const createStudio = mutation({
  args: {
    name: v.string(),
    visualStyle: v.string(),
    narrationTone: v.string(),
    genre: v.optional(v.string()),
    referenceImageUrl: v.optional(v.string()),
    planSlug: v.optional(v.string()),
  },
  returns: v.id("studios"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await checkStudioLimit(ctx, userId, args.planSlug ?? "solo");

    const genre = normalizeGenre(
      args.genre && isGenreId(args.genre) ? args.genre : "true_crime",
    );

    return await ctx.db.insert("studios", {
      userId,
      name: args.name.trim(),
      visualStyle: args.visualStyle.trim(),
      narrationTone: args.narrationTone.trim(),
      genre,
      referenceImageUrl: args.referenceImageUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Met à jour le nom / style / ton / genre d'un Studio.
 */
export const updateStudio = mutation({
  args: {
    studioId: v.id("studios"),
    name: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    narrationTone: v.optional(v.string()),
    voiceInstruct: v.optional(v.string()),
    genre: v.optional(v.string()),
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
      voiceInstruct?: string;
      genre?: "true_crime" | "kids" | "history" | "custom";
      referenceImageUrl?: string;
    } = {};

    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.visualStyle !== undefined) {
      patch.visualStyle = args.visualStyle.trim();
    }
    if (args.narrationTone !== undefined) {
      patch.narrationTone = args.narrationTone.trim();
    }
    if (args.voiceInstruct !== undefined) {
      patch.voiceInstruct = args.voiceInstruct.trim();
    }
    if (args.genre !== undefined) {
      patch.genre = normalizeGenre(args.genre);
    }
    if (args.referenceImageUrl !== undefined) {
      patch.referenceImageUrl = args.referenceImageUrl;
    }

    await ctx.db.patch(args.studioId, patch);
    return args.studioId;
  },
});

/**
 * Attache une image de référence (style / personnage) au Studio.
 */
export const setReferenceImage = mutation({
  args: {
    studioId: v.id("studios"),
    storageId: v.id("_storage"),
  },
  returns: v.object({
    referenceImageUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Studio introuvable");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Fichier introuvable dans le storage");
    }

    if (studio.referenceStorageId) {
      try {
        await ctx.storage.delete(studio.referenceStorageId);
      } catch {
        // ignore
      }
    }

    await ctx.db.patch(args.studioId, {
      referenceImageUrl: url,
      referenceStorageId: args.storageId,
    });

    return { referenceImageUrl: url };
  },
});

/**
 * Retire l'image de référence du Studio.
 */
export const clearReferenceImage = mutation({
  args: { studioId: v.id("studios") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const studio = await ctx.db.get(args.studioId);
    if (!studio || studio.userId !== userId) {
      throw new Error("Studio introuvable");
    }

    if (studio.referenceStorageId) {
      try {
        await ctx.storage.delete(studio.referenceStorageId);
      } catch {
        // ignore
      }
    }

    await ctx.db.patch(args.studioId, {
      referenceImageUrl: undefined,
      referenceStorageId: undefined,
    });

    return null;
  },
});

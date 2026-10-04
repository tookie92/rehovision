/**
 * Presets voix sauvegardés (Voice Lab / clone).
 * Filtrés par sessionId — même modèle MVP que les jobs.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const voiceKind = v.union(v.literal("design"), v.literal("clone"));

function assertSession(sessionId: string) {
  if (!sessionId || sessionId.length < 8) {
    throw new Error("sessionId invalide");
  }
}

export const listBySession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    if (!args.sessionId) return [];
    const rows = await ctx.db
      .query("voices")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    sessionId: v.string(),
    name: v.string(),
    kind: voiceKind,
    instruct: v.optional(v.string()),
    gender: v.optional(v.string()),
    age: v.optional(v.string()),
    pitch: v.optional(v.string()),
    accent: v.optional(v.string()),
    whisper: v.optional(v.boolean()),
    speed: v.optional(v.number()),
    refStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const name = args.name.trim();
    if (!name) throw new Error("Nom de voix requis");
    if (name.length > 64) throw new Error("Nom trop long (max 64)");

    if (args.kind === "design") {
      const instruct = (args.instruct || "").trim();
      if (!instruct) {
        throw new Error("Recette Voice Lab vide — choisis des attributs");
      }
    } else if (!args.refStorageId) {
      throw new Error("Clone : échantillon audio requis");
    }

    return await ctx.db.insert("voices", {
      sessionId: args.sessionId,
      name,
      kind: args.kind,
      instruct: args.instruct?.trim() || undefined,
      gender: args.gender || undefined,
      age: args.age || undefined,
      pitch: args.pitch || undefined,
      accent: args.accent || undefined,
      whisper: args.whisper ?? undefined,
      speed:
        typeof args.speed === "number" && Number.isFinite(args.speed)
          ? args.speed
          : undefined,
      refStorageId: args.refStorageId,
      createdAt: Date.now(),
    });
  },
});

export const rename = mutation({
  args: {
    sessionId: v.string(),
    voiceId: v.id("voices"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const row = await ctx.db.get(args.voiceId);
    if (!row || row.sessionId !== args.sessionId) {
      throw new Error("Voix introuvable");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Nom requis");
    if (name.length > 64) throw new Error("Nom trop long (max 64)");
    await ctx.db.patch(args.voiceId, { name });
  },
});

export const remove = mutation({
  args: {
    sessionId: v.string(),
    voiceId: v.id("voices"),
  },
  handler: async (ctx, args) => {
    assertSession(args.sessionId);
    const row = await ctx.db.get(args.voiceId);
    if (!row || row.sessionId !== args.sessionId) {
      throw new Error("Voix introuvable");
    }
    // Ne pas supprimer le storage partagé (peut servir à un job) — MVP simple.
    await ctx.db.delete(args.voiceId);
  },
});

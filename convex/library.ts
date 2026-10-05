/**
 * AVERTISSEMENT : Aucune authentification.
 * Ne pas exposer publiquement avant d'avoir ajouté Convex Auth ou équivalent.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertWorkerToken } from "./lib/auth";
import type { Doc, Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("library").collect();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export type UnifiedLibraryItem = {
  id: string;
  kind:
    | "preset"
    | "music"
    | "audiobook"
    | "dub"
    | "narration"
    | "clip";
  title: string;
  subtitle: string;
  storageId: Id<"_storage">;
  createdAt: number;
  jobId?: Id<"jobs">;
  libraryId?: Id<"library">;
};

function jobKind(type: Doc<"jobs">["type"]): UnifiedLibraryItem["kind"] {
  if (type === "music") return "music";
  if (type === "audiobook") return "audiobook";
  if (type === "narration") return "narration";
  if (type === "dub") return "dub";
  return "clip";
}

function jobTitle(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  if (job.type === "music") return String(p.prompt ?? "Musique").slice(0, 120);
  if (job.type === "audiobook") {
    const title = String(p.title ?? "").trim();
    if (title) return title;
    const text = String(p.text ?? "");
    return text.length > 80 ? `${text.slice(0, 80)}…` : text || "Livre audio";
  }
  if (job.type === "dub" || job.type === "narration") {
    const text = String(p.text ?? "");
    if (text) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return p.sourceStorageId ? "Doublage audio" : "Doublage";
  }
  return `Clip · ${job.type}`;
}

function jobSubtitle(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  const meta = job.resultMeta as Record<string, unknown> | undefined;
  if (job.type === "music") {
    const mode = p.instrumental === false ? "vocal" : "instr";
    return `${p.durationS ?? "?"}s · ${mode}`;
  }
  if (job.type === "audiobook") {
    const n = meta?.chapterCount ?? "?";
    return `${p.sourceLang ?? "?"} → ${p.targetLang ?? "?"} · ${n} segment(s)`;
  }
  if (job.type === "dub" || job.type === "narration") {
    return `${p.sourceLang ?? "?"} → ${p.targetLang ?? "?"}`;
  }
  return job.type;
}

/** Presets bench + outputs terminés de la session (voix, livres, clips, tracks). */
export const listForSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const [presets, jobs] = await Promise.all([
      ctx.db.query("library").collect(),
      ctx.db
        .query("jobs")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
    ]);

    const items: UnifiedLibraryItem[] = [];

    for (const item of presets) {
      items.push({
        id: `preset:${item._id}`,
        kind: "preset",
        title: item.title || item.mood,
        subtitle: `${item.mood} · ${item.durationS}s`,
        storageId: item.storageId,
        createdAt: item.createdAt,
        libraryId: item._id,
      });
    }

    for (const job of jobs) {
      if (job.status !== "done" || !job.resultStorageId) continue;
      if (
        job.type !== "music" &&
        job.type !== "audiobook" &&
        job.type !== "dub" &&
        job.type !== "narration" &&
        job.type !== "clips" &&
        job.type !== "clip_export"
      ) {
        continue;
      }
      items.push({
        id: `job:${job._id}`,
        kind: jobKind(job.type),
        title: jobTitle(job),
        subtitle: jobSubtitle(job),
        storageId: job.resultStorageId,
        createdAt: job.finishedAt ?? job.createdAt,
        jobId: job._id,
      });
    }

    return items.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Sauvegarde un job terminé dans la table library (musique / audiobook). */
export const saveFromJob = mutation({
  args: {
    sessionId: v.string(),
    jobId: v.id("jobs"),
    title: v.optional(v.string()),
    mood: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.sessionId !== args.sessionId) {
      throw new Error("Job introuvable pour cette session");
    }
    if (job.status !== "done" || !job.resultStorageId) {
      throw new Error("Le job n'est pas terminé ou sans fichier");
    }
    if (job.type !== "music" && job.type !== "audiobook") {
      throw new Error("Seuls musique et livre audio peuvent être sauvés");
    }

    const p = job.params as Record<string, unknown>;
    const title =
      args.title?.trim() ||
      (job.type === "audiobook"
        ? String(p.title ?? "Livre audio")
        : String(p.prompt ?? "Musique").slice(0, 80));
    const mood =
      args.mood?.trim() ||
      (job.type === "audiobook" ? "audiobook" : "music");
    const durationS =
      typeof p.durationS === "number"
        ? p.durationS
        : job.type === "audiobook"
          ? 0
          : 30;
    const prompt =
      job.type === "audiobook"
        ? String(p.text ?? title).slice(0, 240)
        : String(p.prompt ?? title);

    return await ctx.db.insert("library", {
      title,
      mood,
      durationS,
      storageId: job.resultStorageId,
      prompt,
      createdAt: Date.now(),
    });
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

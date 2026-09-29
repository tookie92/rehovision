import {
  httpAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { assertWorkerSecret } from "./lib/workerAuth";
import { buildImagePrompt } from "./lib/imagePrompt";
import { parseGeneratedScript } from "./lib/scriptPrompt";
import { enqueueAssetJobsForProject } from "./lib/enqueueAssets";
import { sliceCaptionSegments } from "./lib/captionSegments";

/** Jobs "processing" plus vieux que ça = worker probablement mort → requeue. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

const jobType = v.union(
  v.literal("script"),
  v.literal("image"),
  v.literal("voiceover"),
  v.literal("video_assembly"),
  v.literal("transcribe"),
  v.literal("propose_clips"),
  v.literal("render_clip"),
);

const jobDoc = v.object({
  _id: v.id("generationJobs"),
  _creationTime: v.number(),
  type: jobType,
  sceneId: v.optional(v.id("scenes")),
  videoProjectId: v.optional(v.id("videoProjects")),
  clipProjectId: v.optional(v.id("clipProjects")),
  clipId: v.optional(v.id("clips")),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("done"),
    v.literal("failed"),
  ),
  provider: v.union(v.literal("local"), v.literal("api-fallback")),
  payload: v.any(),
  resultUrl: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * Jobs d'un projet (temps réel UI) — ownership via le Studio.
 */
export const getJobsByProject = query({
  args: { videoProjectId: v.id("videoProjects") },
  returns: v.array(jobDoc),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.videoProjectId);
    if (!project) return [];

    const studio = await ctx.db.get(project.studioId);
    if (!studio || studio.userId !== userId) return [];

    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.videoProjectId),
      )
      .collect();

    // Plus récents d'abord pour l'UI
    jobs.sort((a, b) => b.updatedAt - a.updatedAt);
    return jobs;
  },
});

/**
 * Récupère le prochain job pending (ordre de création) et le passe en processing.
 * Remet aussi en file les jobs processing trop anciens (worker crash / arrêt).
 */
export const claimNextJob = internalMutation({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("generationJobs"),
      type: jobType,
      sceneId: v.optional(v.id("scenes")),
      videoProjectId: v.optional(v.id("videoProjects")),
      clipProjectId: v.optional(v.id("clipProjects")),
      clipId: v.optional(v.id("clips")),
      status: v.literal("processing"),
      provider: v.union(v.literal("local"), v.literal("api-fallback")),
      payload: v.any(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const now = Date.now();
    const staleBefore = now - STALE_PROCESSING_MS;

    const processing = await ctx.db
      .query("generationJobs")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();

    for (const job of processing) {
      if (job.updatedAt < staleBefore) {
        await ctx.db.patch(job._id, {
          status: "pending",
          errorMessage: undefined,
          updatedAt: now,
        });
      }
    }

    const pending = await ctx.db
      .query("generationJobs")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();

    if (!pending) return null;

    await ctx.db.patch(pending._id, {
      status: "processing",
      updatedAt: now,
    });

    return {
      _id: pending._id,
      type: pending.type,
      sceneId: pending.sceneId,
      videoProjectId: pending.videoProjectId,
      clipProjectId: pending.clipProjectId,
      clipId: pending.clipId,
      status: "processing" as const,
      provider: pending.provider,
      payload: pending.payload,
      createdAt: pending.createdAt,
      updatedAt: now,
    };
  },
});

/**
 * Contexte scènes pour un job video_assembly.
 */
export const getAssemblyContext = internalQuery({
  args: { videoProjectId: v.id("videoProjects") },
  returns: v.union(
    v.object({
      title: v.string(),
      scenes: v.array(
        v.object({
          order: v.number(),
          narrationText: v.string(),
          imageUrl: v.optional(v.string()),
          audioUrl: v.optional(v.string()),
          durationSeconds: v.optional(v.number()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.videoProjectId);
    if (!project) return null;

    const scenes = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", args.videoProjectId),
      )
      .collect();

    scenes.sort((a, b) => a.order - b.order);

    return {
      title: project.title,
      scenes: scenes.map((s) => ({
        order: s.order,
        narrationText: s.narrationText,
        imageUrl: s.imageUrl,
        audioUrl: s.audioUrl,
        durationSeconds: s.durationSeconds,
      })),
    };
  },
});

/**
 * Applique le résultat d'un job sur la scène / le projet, puis vérifie la complétion.
 */
export const applyJobResult = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    resultUrl: v.string(),
    durationSeconds: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job introuvable");

    const now = Date.now();

    if (args.errorMessage) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage: args.errorMessage,
        updatedAt: now,
      });
      if (job.type === "render_clip" && job.clipId) {
        await ctx.db.patch(job.clipId, {
          status: "failed",
          errorMessage: args.errorMessage,
        });
        if (job.clipProjectId) {
          await refreshClipProjectStatus(ctx, job.clipProjectId);
        }
      }
      return null;
    }

    await ctx.db.patch(args.jobId, {
      status: "done",
      resultUrl: args.resultUrl,
      updatedAt: now,
    });

    if (job.type === "image" && job.sceneId) {
      await ctx.db.patch(job.sceneId, { imageUrl: args.resultUrl });
    } else if (job.type === "voiceover" && job.sceneId) {
      const patch: { audioUrl: string; durationSeconds?: number } = {
        audioUrl: args.resultUrl,
      };
      if (args.durationSeconds !== undefined) {
        patch.durationSeconds = args.durationSeconds;
      }
      await ctx.db.patch(job.sceneId, patch);
    } else if (job.type === "video_assembly" && job.videoProjectId) {
      await ctx.db.patch(job.videoProjectId, {
        finalVideoUrl: args.resultUrl,
        status: "ready",
      });
    } else if (job.type === "render_clip" && job.clipId) {
      await ctx.db.patch(job.clipId, {
        resultUrl: args.resultUrl,
        status: "ready",
        errorMessage: undefined,
      });
      if (job.clipProjectId) {
        await refreshClipProjectStatus(ctx, job.clipProjectId);
      }
    }
    // type "script" / "transcribe" / "propose_clips" : JSON via apply*Result

    if (job.videoProjectId) {
      await ensureAssemblyJobIfReady(ctx, job.videoProjectId);
    }
    return null;
  },
});

/**
 * Applique le JSON script renvoyé par Ollama (worker local).
 */
export const applyScriptResult = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    rawScript: v.string(),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job introuvable");
    if (job.type !== "script") {
      throw new Error("Ce job n'est pas un job script");
    }

    const now = Date.now();

    if (args.errorMessage) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage: args.errorMessage,
        updatedAt: now,
      });
      return null;
    }

    if (!job.videoProjectId) {
      throw new Error("Job script sans videoProjectId");
    }
    const videoProjectId = job.videoProjectId;
    const project = await ctx.db.get(videoProjectId);
    if (!project) throw new Error("Projet introuvable");
    const studio = await ctx.db.get(project.studioId);
    if (!studio) throw new Error("Studio introuvable");

    const script = parseGeneratedScript(args.rawScript);
    const scenes = script.scenes.map((scene) => ({
      order: scene.order,
      narrationText: scene.narrationText,
      visualBeat: scene.visualBeat,
      imagePrompt: buildImagePrompt({
        visualBeat: scene.visualBeat || scene.narrationText,
        visualStyle: studio.visualStyle,
        narrationTone: studio.narrationTone,
        topic: project.topic,
        hasStyleReference: Boolean(studio.referenceImageUrl),
      }),
    }));

    const existing = await ctx.db
      .query("scenes")
      .withIndex("by_videoProjectId", (q) =>
        q.eq("videoProjectId", videoProjectId),
      )
      .collect();

    for (const scene of existing) {
      await ctx.db.delete(scene._id);
    }

    for (const scene of scenes) {
      await ctx.db.insert("scenes", {
        videoProjectId,
        order: scene.order,
        narrationText: scene.narrationText,
        visualBeat: scene.visualBeat,
        imagePrompt: scene.imagePrompt,
      });
    }

    await ctx.db.patch(videoProjectId, {
      title: script.title,
      status: "script_ready",
    });

    await ctx.db.patch(args.jobId, {
      status: "done",
      updatedAt: now,
    });

    // Flux sujet → reel : enchaîner images + voix sans second clic
    if (project.autoGenerateAssets) {
      const refreshed = await ctx.db.get(videoProjectId);
      if (refreshed) {
        await enqueueAssetJobsForProject(ctx, {
          project: refreshed,
          studio,
          userId: studio.userId,
        });
      }
    }

    return null;
  },
});

/**
 * Mutation interne exposée : vérifie si le projet peut passer en montage.
 */
export const checkProjectCompletion = internalMutation({
  args: { videoProjectId: v.id("videoProjects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureAssemblyJobIfReady(ctx, args.videoProjectId);
    return null;
  },
});

/**
 * Si toutes les scènes ont image + audio, crée un job video_assembly.
 */
async function ensureAssemblyJobIfReady(
  ctx: MutationCtx,
  videoProjectId: Id<"videoProjects">,
) {
  const project = await ctx.db.get(videoProjectId);
  if (!project) return;
  if (project.status === "ready" || project.status === "exported") return;

  const scenes = await ctx.db
    .query("scenes")
    .withIndex("by_videoProjectId", (q) =>
      q.eq("videoProjectId", videoProjectId),
    )
    .collect();

  if (scenes.length === 0) return;

  const allReady = scenes.every((s) => s.imageUrl && s.audioUrl);
  if (!allReady) return;

  const existingJobs = await ctx.db
    .query("generationJobs")
    .withIndex("by_videoProjectId", (q) =>
      q.eq("videoProjectId", videoProjectId),
    )
    .collect();

  const hasAssembly = existingJobs.some(
    (j) =>
      j.type === "video_assembly" &&
      (j.status === "pending" ||
        j.status === "processing" ||
        j.status === "done"),
  );
  if (hasAssembly) return;

  const now = Date.now();
  await ctx.db.insert("generationJobs", {
    type: "video_assembly",
    videoProjectId,
    status: "pending",
    provider: "local",
    payload: {
      sceneIds: scenes.map((s) => s._id),
    },
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * HTTP Action — prochain job pending.
 * Auth : header `x-worker-secret` (pas Clerk).
 */
export const getNextJob = httpAction(async (ctx, request) => {
  try {
    assertWorkerSecret(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHORIZED_WORKER" ? 401 : 500;
    return json({ error: msg }, status);
  }

  const job = await ctx.runMutation(internal.generationJobs.claimNextJob, {});

  if (!job) {
    return json({ job: null });
  }

  let assemblyContext = null;
  if (job.type === "video_assembly" && job.videoProjectId) {
    assemblyContext = await ctx.runQuery(
      internal.generationJobs.getAssemblyContext,
      { videoProjectId: job.videoProjectId },
    );
  }

  return json({ job: { ...job, assemblyContext } });
});

/**
 * HTTP Action — upload du résultat + marquage done.
 * Body : fichier brut | Query : jobId, durationSeconds?, error?
 */
export const submitJobResult = httpAction(async (ctx, request) => {
  try {
    assertWorkerSecret(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHORIZED_WORKER" ? 401 : 500;
    return json({ error: msg }, status);
  }

  try {
    const url = new URL(request.url);
    const jobIdParam = url.searchParams.get("jobId");
    if (!jobIdParam) {
      return json({ error: "jobId requis" }, 400);
    }
    const jobId = jobIdParam as Id<"generationJobs">;

    const errorMessage = url.searchParams.get("error");
    if (errorMessage) {
      await ctx.runMutation(internal.generationJobs.applyJobResult, {
        jobId,
        resultUrl: "",
        errorMessage,
      });
      return json({ ok: true, failed: true });
    }

    // arrayBuffer + Uint8Array : Blob([ArrayBuffer]) échoue parfois côté Convex
    const buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return json({ error: "Fichier vide" }, 400);
    }

    const contentType =
      request.headers.get("Content-Type") || "application/octet-stream";
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });

    const storageId = await ctx.storage.store(blob);
    const resultUrl = await ctx.storage.getUrl(storageId);
    if (!resultUrl) {
      return json({ error: "URL storage indisponible" }, 500);
    }

    const durationParam = url.searchParams.get("durationSeconds");
    const parsedDuration = durationParam ? Number(durationParam) : undefined;
    // Arrondi pour éviter les floats trop longs côté JSON / logs
    const durationSeconds =
      parsedDuration !== undefined && !Number.isNaN(parsedDuration)
        ? Math.round(parsedDuration * 1000) / 1000
        : undefined;

    await ctx.runMutation(internal.generationJobs.applyJobResult, {
      jobId,
      resultUrl,
      durationSeconds,
    });

    return json({ ok: true, resultUrl, storageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("submitJobResult failed:", msg);
    return json({ error: msg }, 500);
  }
});

/**
 * HTTP Action — résultat JSON du job script (Ollama).
 * Body : { "rawScript": "..." } ou { "error": "..." }
 */
export const submitScriptResult = httpAction(async (ctx, request) => {
  try {
    assertWorkerSecret(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHORIZED_WORKER" ? 401 : 500;
    return json({ error: msg }, status);
  }

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("jobId");
  if (!jobIdParam) {
    return json({ error: "jobId requis" }, 400);
  }
  const jobId = jobIdParam as Id<"generationJobs">;

  let body: { rawScript?: string; error?: string };
  try {
    body = (await request.json()) as { rawScript?: string; error?: string };
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  if (body.error) {
    await ctx.runMutation(internal.generationJobs.applyScriptResult, {
      jobId,
      rawScript: "",
      errorMessage: body.error,
    });
    return json({ ok: true, failed: true });
  }

  if (!body.rawScript) {
    return json({ error: "rawScript requis" }, 400);
  }

  try {
    await ctx.runMutation(internal.generationJobs.applyScriptResult, {
      jobId,
      rawScript: body.rawScript,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur applyScriptResult";
    await ctx.runMutation(internal.generationJobs.applyScriptResult, {
      jobId,
      rawScript: "",
      errorMessage: msg,
    });
    return json({ error: msg }, 422);
  }

  return json({ ok: true });
});

/**
 * Applique transcript (Whisper) ou propositions de clips (Ollama).
 * Body selon le type de job :
 * - transcribe: { transcript: { language, duration, segments } }
 * - propose_clips: { clips: [{ title, hookReason, startSec, endSec, captionText }] }
 */
export const applyClipPipelineResult = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    transcript: v.optional(v.any()),
    clips: v.optional(
      v.array(
        v.object({
          title: v.string(),
          hookReason: v.optional(v.string()),
          viralScore: v.optional(v.number()),
          startSec: v.number(),
          endSec: v.number(),
          captionText: v.optional(v.string()),
          broll: v.optional(
            v.array(
              v.object({
                relStartSec: v.number(),
                durationSec: v.number(),
                prompt: v.string(),
              }),
            ),
          ),
        }),
      ),
    ),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job introuvable");
    if (!job.clipProjectId) {
      throw new Error("Job clip sans clipProjectId");
    }

    const now = Date.now();
    const projectId = job.clipProjectId;

    if (args.errorMessage) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        errorMessage: args.errorMessage,
        updatedAt: now,
      });
      await ctx.db.patch(projectId, {
        status: "failed",
        errorMessage: args.errorMessage,
      });
      return null;
    }

    if (job.type === "transcribe") {
      if (!args.transcript) {
        throw new Error("transcript requis");
      }
      const duration =
        typeof args.transcript.duration === "number"
          ? args.transcript.duration
          : undefined;

      await ctx.db.patch(projectId, {
        transcript: args.transcript,
        durationSeconds: duration,
        status: "proposing",
        errorMessage: undefined,
      });

      await ctx.db.patch(args.jobId, {
        status: "done",
        updatedAt: now,
      });

      await ctx.db.insert("generationJobs", {
        type: "propose_clips",
        clipProjectId: projectId,
        status: "pending",
        provider: "local",
        payload: { transcript: args.transcript },
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }

    if (job.type === "propose_clips") {
      const proposals = args.clips ?? [];
      if (proposals.length === 0) {
        throw new Error("Aucun clip proposé");
      }

      const existing = await ctx.db
        .query("clips")
        .withIndex("by_clipProjectId", (q) =>
          q.eq("clipProjectId", projectId),
        )
        .collect();
      for (const c of existing) {
        await ctx.db.delete(c._id);
      }

      const project = await ctx.db.get(projectId);
      const sourceVideoUrl = project?.sourceVideoUrl;
      const youtubeUrl = project?.sourceYoutubeUrl;
      const transcript = project?.transcript;

      for (let i = 0; i < proposals.length; i++) {
        const p = proposals[i]!;
        const clipId = await ctx.db.insert("clips", {
          clipProjectId: projectId,
          order: i + 1,
          title: p.title,
          hookReason: p.hookReason,
          viralScore:
            typeof p.viralScore === "number" ? p.viralScore : undefined,
          startSec: p.startSec,
          endSec: p.endSec,
          captionText: p.captionText,
          status: "rendering",
          createdAt: now,
        });

        const captionSegments = sliceCaptionSegments(
          transcript,
          p.startSec,
          p.endSec,
        );

        await ctx.db.insert("generationJobs", {
          type: "render_clip",
          clipProjectId: projectId,
          clipId,
          status: "pending",
          provider: "local",
          payload: {
            sourceVideoUrl,
            youtubeUrl,
            localFileId: project?.sourceLocalFileId,
            startSec: p.startSec,
            endSec: p.endSec,
            captionText: p.captionText ?? "",
            captionSegments,
            brollCues: p.broll ?? [],
            captionStyle: project?.captionStyle ?? "viral",
            layoutMode: project?.layoutMode ?? "smart",
            voiceoverMode: project?.voiceoverMode ?? "off",
            audioEnhance: project?.audioEnhance ?? "off",
            lookFilter: project?.lookFilter ?? "off",
            punchEffect: project?.punchEffect ?? "off",
            logoUrl: project?.logoUrl,
            logoCorner: project?.logoCorner ?? "br",
            logoOpacity: project?.logoOpacity ?? 0.85,
            musicUrl: project?.musicUrl,
            musicVolume: project?.musicVolume ?? 0.18,
            title: p.title,
          },
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.patch(projectId, {
        status: "rendering",
        errorMessage: undefined,
      });
      await ctx.db.patch(args.jobId, {
        status: "done",
        updatedAt: now,
      });
      return null;
    }

    throw new Error(`Type de job clip invalide: ${job.type}`);
  },
});

async function refreshClipProjectStatus(
  ctx: MutationCtx,
  clipProjectId: Id<"clipProjects">,
) {
  const clips = await ctx.db
    .query("clips")
    .withIndex("by_clipProjectId", (q) => q.eq("clipProjectId", clipProjectId))
    .collect();
  if (clips.length === 0) return;

  const anyFailed = clips.some((c) => c.status === "failed");
  const allDone = clips.every(
    (c) => c.status === "ready" || c.status === "failed",
  );
  if (!allDone) return;

  await ctx.db.patch(clipProjectId, {
    status: anyFailed && clips.every((c) => c.status === "failed")
      ? "failed"
      : "ready",
  });
}

/**
 * Après yt-dlp : enregistre la vidéo source téléchargée sur le projet clip.
 */
export const setClipProjectSource = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    storageId: v.id("_storage"),
    resultUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job?.clipProjectId) {
      throw new Error("Job clip introuvable");
    }
    await ctx.db.patch(job.clipProjectId, {
      sourceStorageId: args.storageId,
      sourceVideoUrl: args.resultUrl,
      status: "transcribing",
      errorMessage: undefined,
    });
    return null;
  },
});

/**
 * HTTP — upload de la vidéo source (YouTube → storage) pendant un job transcribe.
 * Query: jobId — Body: fichier brut
 */
export const submitSourceVideo = httpAction(async (ctx, request) => {
  try {
    assertWorkerSecret(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHORIZED_WORKER" ? 401 : 500;
    return json({ error: msg }, status);
  }

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("jobId");
  if (!jobIdParam) {
    return json({ error: "jobId requis" }, 400);
  }
  const jobId = jobIdParam as Id<"generationJobs">;

  try {
    const buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return json({ error: "Fichier vide" }, 400);
    }
    const contentType =
      request.headers.get("Content-Type") || "video/mp4";
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
    const storageId = await ctx.storage.store(blob);
    const resultUrl = await ctx.storage.getUrl(storageId);
    if (!resultUrl) {
      return json({ error: "URL storage indisponible" }, 500);
    }
    await ctx.runMutation(internal.generationJobs.setClipProjectSource, {
      jobId,
      storageId,
      resultUrl,
    });
    return json({ ok: true, resultUrl, storageId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

/**
 * HTTP — résultat JSON pipeline ChatCut (transcribe / propose_clips).
 */
export const submitClipPipelineResult = httpAction(async (ctx, request) => {
  try {
    assertWorkerSecret(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "UNAUTHORIZED_WORKER" ? 401 : 500;
    return json({ error: msg }, status);
  }

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("jobId");
  if (!jobIdParam) {
    return json({ error: "jobId requis" }, 400);
  }
  const jobId = jobIdParam as Id<"generationJobs">;

  let body: {
    transcript?: unknown;
    clips?: Array<{
      title: string;
      hookReason?: string;
      startSec: number;
      endSec: number;
      captionText?: string;
      broll?: Array<{
        relStartSec: number;
        durationSec: number;
        prompt: string;
      }>;
    }>;
    error?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  try {
    await ctx.runMutation(internal.generationJobs.applyClipPipelineResult, {
      jobId,
      transcript: body.transcript,
      clips: body.clips,
      errorMessage: body.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur applyClipPipelineResult";
    await ctx.runMutation(internal.generationJobs.applyClipPipelineResult, {
      jobId,
      errorMessage: msg,
    });
    return json({ error: msg }, 422);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Enfile les jobs image + voiceover pour les scènes d'un projet.
 * Partagé entre queueGenerationJobs (UI) et applyScriptResult (auto-chaînage).
 */

import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { buildImagePrompt } from "./imagePrompt";
import { bumpUsage } from "../usage";
import {
  getFacelessLook,
  getFacelessVoice,
  resolveLookId,
  type CastMember,
} from "./facelessPresets";

export type AssetKind = "image" | "voiceover";

function resolveStyle(studio: Doc<"studios">, project: Doc<"videoProjects">) {
  const look = project.lookId
    ? getFacelessLook(resolveLookId(project.lookId))
    : null;
  const voice = project.voiceId ? getFacelessVoice(project.voiceId) : null;
  return {
    visualStyle: look?.prompt ?? studio.visualStyle,
    narrationTone: look?.toneHint ?? studio.narrationTone,
    negativePrompt: look?.negativePrompt ?? "",
    voiceInstruct:
      voice?.instruct ??
      studio.voiceInstruct ??
      studio.narrationTone,
    voiceSpeed: voice?.speed ?? 1.0,
  };
}

export async function enqueueAssetJobsForProject(
  ctx: MutationCtx,
  args: {
    project: Doc<"videoProjects">;
    studio: Doc<"studios">;
    userId: string;
    kinds?: AssetKind[];
  },
): Promise<number> {
  const { project, studio, userId } = args;
  const kinds = args.kinds ?? ["image", "voiceover"];
  const wantImage = kinds.includes("image");
  const wantVoice = kinds.includes("voiceover");

  const scenes = await ctx.db
    .query("scenes")
    .withIndex("by_videoProjectId", (q) =>
      q.eq("videoProjectId", project._id),
    )
    .collect();

  if (scenes.length === 0) {
    throw new Error("Aucune scène — générez d'abord le script");
  }

  const now = Date.now();
  let jobCount = 0;
  const hasRef = Boolean(studio.referenceImageUrl);
  const { visualStyle, narrationTone, negativePrompt, voiceInstruct, voiceSpeed } =
    resolveStyle(studio, project);
  const cast = (project.cast ?? []) as CastMember[];
  const imageSeed = project.imageSeed;

  // Annule jobs actifs des kinds demandés sur ce projet
  const existing = await ctx.db
    .query("generationJobs")
    .withIndex("by_videoProjectId", (q) =>
      q.eq("videoProjectId", project._id),
    )
    .collect();

  for (const job of existing) {
    if (
      kinds.includes(job.type as AssetKind) &&
      (job.status === "pending" || job.status === "processing")
    ) {
      await ctx.db.patch(job._id, {
        status: "failed",
        errorMessage: "Remplacé par une nouvelle génération",
        updatedAt: now,
      });
    }
  }

  for (const scene of scenes) {
    if (wantImage) {
      const beat = scene.visualBeat?.trim() || scene.narrationText;
      const prompt = buildImagePrompt({
        visualBeat: beat,
        visualStyle,
        narrationTone,
        topic: project.topic,
        hasStyleReference: hasRef,
        cast,
        negativePrompt,
      });
      await ctx.db.patch(scene._id, { imagePrompt: prompt, imageUrl: undefined });

      await ctx.db.insert("generationJobs", {
        type: "image",
        sceneId: scene._id,
        videoProjectId: project._id,
        status: "pending",
        provider: "local",
        payload: {
          prompt,
          visualStyle,
          negativePrompt,
          seed: imageSeed,
          referenceImageUrl: studio.referenceImageUrl,
        },
        createdAt: now,
        updatedAt: now,
      });
      jobCount += 1;
    }

    if (wantVoice) {
      await ctx.db.patch(scene._id, { audioUrl: undefined });

      await ctx.db.insert("generationJobs", {
        type: "voiceover",
        sceneId: scene._id,
        videoProjectId: project._id,
        status: "pending",
        provider: "local",
        payload: {
          text: scene.narrationText,
          tone: narrationTone,
          voiceInstruct,
          speed: voiceSpeed,
          voiceId: project.voiceId,
        },
        createdAt: now,
        updatedAt: now,
      });
      jobCount += 1;
    }
  }

  await ctx.db.patch(project._id, {
    status: "generating",
    finalVideoUrl: undefined,
  });
  if (wantImage) {
    await bumpUsage(ctx, userId, { imagesGenerated: scenes.length });
  }

  return jobCount;
}

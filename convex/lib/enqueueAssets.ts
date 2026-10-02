/**
 * Enfile les jobs image + voiceover pour les scènes d'un projet.
 * Style = ref image projet (SDXL+IP) ; sinon prompt générique upload.
 */

import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { buildImagePrompt } from "./imagePrompt";
import { bumpUsage } from "../usage";
import {
  getFacelessVoice,
  UPLOAD_STYLE_NEGATIVE,
  UPLOAD_STYLE_PROMPT,
  type CastMember,
} from "./facelessPresets";

export type AssetKind = "image" | "voiceover";

/** URL ref style projet si présente (plus liée à un lookId). */
export function resolveProjectStyleReference(
  project: Doc<"videoProjects">,
): string | null {
  const url = project.styleReferenceUrl?.trim();
  return url || null;
}

function resolveStyle(studio: Doc<"studios">, project: Doc<"videoProjects">) {
  const voice = project.voiceId ? getFacelessVoice(project.voiceId) : null;
  const referenceImageUrl = resolveProjectStyleReference(project);
  const useStyleReference = Boolean(referenceImageUrl);
  return {
    visualStyle: useStyleReference
      ? UPLOAD_STYLE_PROMPT
      : studio.visualStyle?.trim() || UPLOAD_STYLE_PROMPT,
    narrationTone: studio.narrationTone,
    negativePrompt: UPLOAD_STYLE_NEGATIVE,
    useStyleReference,
    referenceImageUrl: referenceImageUrl ?? undefined,
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
    /** Force un nouveau seed (changement de style). */
    newImageSeed?: number;
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
  const resolved = resolveStyle(studio, project);
  const {
    visualStyle,
    narrationTone,
    negativePrompt,
    voiceInstruct,
    voiceSpeed,
    useStyleReference,
    referenceImageUrl,
  } = resolved;
  const cast = (project.cast ?? []) as CastMember[];
  const imageSeed =
    args.newImageSeed ??
    project.imageSeed ??
    Math.floor(Math.random() * 2_147_483_647);

  if (args.newImageSeed != null && args.newImageSeed !== project.imageSeed) {
    await ctx.db.patch(project._id, { imageSeed: args.newImageSeed });
  }

  // Sync studio.visualStyle sur le prompt upload (évite stale look presets).
  if (visualStyle !== studio.visualStyle) {
    await ctx.db.patch(studio._id, {
      visualStyle,
      narrationTone,
    });
  }

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
        hasStyleReference: useStyleReference,
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
          referenceImageUrl,
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

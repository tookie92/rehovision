/**
 * Enfile les jobs image + voiceover pour toutes les scènes d'un projet.
 * Partagé entre queueGenerationJobs (UI) et applyScriptResult (auto-chaînage).
 */

import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { buildImagePrompt } from "./imagePrompt";
import { bumpUsage } from "../usage";

export async function enqueueAssetJobsForProject(
  ctx: MutationCtx,
  args: {
    project: Doc<"videoProjects">;
    studio: Doc<"studios">;
    userId: string;
  },
): Promise<number> {
  const { project, studio, userId } = args;

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

  for (const scene of scenes) {
    const beat = scene.visualBeat?.trim() || scene.narrationText;
    // Toujours reconstruire avec le visualStyle *actuel* du studio
    // (sinon un imagePrompt figé au script ignore les chips Style).
    const prompt = buildImagePrompt({
      visualBeat: beat,
      visualStyle: studio.visualStyle,
      narrationTone: studio.narrationTone,
      topic: project.topic,
      hasStyleReference: hasRef,
    });
    await ctx.db.patch(scene._id, { imagePrompt: prompt });

    await ctx.db.insert("generationJobs", {
      type: "image",
      sceneId: scene._id,
      videoProjectId: project._id,
      status: "pending",
      provider: "local",
      payload: {
        prompt,
        visualStyle: studio.visualStyle,
        referenceImageUrl: studio.referenceImageUrl,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("generationJobs", {
      type: "voiceover",
      sceneId: scene._id,
      videoProjectId: project._id,
      status: "pending",
      provider: "local",
      payload: {
        text: scene.narrationText,
        tone: studio.narrationTone,
      },
      createdAt: now,
      updatedAt: now,
    });

    jobCount += 2;
  }

  await ctx.db.patch(project._id, { status: "generating" });
  await bumpUsage(ctx, userId, { imagesGenerated: scenes.length });

  return jobCount;
}

"use client";

import {
  PIPELINE_STEPS,
  isPipelineActive,
  pipelineDetail,
  pipelineStepIndex,
  projectStatusTone,
  PROJECT_STATUS_LABEL,
} from "@/lib/clipStatus";

type Props = {
  status: string;
  errorMessage?: string | null;
  readyCount?: number;
  clipCount?: number;
};

/** Erreurs yt-dlp trop longues → message actionnable. */
export function friendlyPipelineError(msg: string): string {
  const lower = msg.toLowerCase();
  if (
    lower.includes("sign in to confirm") ||
    lower.includes("anti-bot") ||
    lower.includes("yt_cookies") ||
    lower.includes("not a bot")
  ) {
    return (
      "YouTube bloque le téléchargement (anti-bot). " +
      "Sur le worker : place les cookies dans worker/cookies/youtube.txt, " +
      "ajoute YT_COOKIES=./cookies/youtube.txt dans worker/.env, redémarre le worker, " +
      "puis Relancer — ou importe un fichier MP4 depuis Import."
    );
  }
  if (msg.length > 320) return `${msg.slice(0, 320)}…`;
  return msg;
}

/**
 * Stepper visuel du funnel clips (source → Whisper → hooks → rendu).
 */
export function ClipPipelineProgress({
  status,
  errorMessage,
  readyCount = 0,
  clipCount = 0,
}: Props) {
  const current = pipelineStepIndex(status);
  const active = isPipelineActive(status);
  const failed = status === "failed";
  const ready = status === "ready";

  return (
    <div className="rounded-xl border border-border bg-card/40 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Pipeline
        </p>
        <span className={`timecode text-xs ${projectStatusTone(status)}`}>
          {active && (
            <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
          )}
          {PROJECT_STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PIPELINE_STEPS.map((step, i) => {
          const done = ready || (!failed && current > i);
          const currentStep =
            !ready && !failed && (current === i || (status === "uploading" && i === 0));
          return (
            <li
              key={step.key}
              className={
                done
                  ? "rounded-lg border border-signal/30 bg-signal/5 px-3 py-2"
                  : currentStep
                    ? "rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2"
                    : failed && current >= 0 && i === Math.max(current, 0)
                      ? "rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2"
                      : "rounded-lg border border-border/60 px-3 py-2 opacity-50"
              }
            >
              <p className="timecode text-[10px] text-muted-foreground">
                0{i + 1}
              </p>
              <p className="mt-0.5 text-sm text-foreground">{step.label}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-sm text-muted-foreground">
        {pipelineDetail(status, { readyCount, clipCount })}
      </p>

      {errorMessage && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {friendlyPipelineError(errorMessage)}
        </p>
      )}
    </div>
  );
}

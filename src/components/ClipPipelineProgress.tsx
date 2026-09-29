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
      "YouTube bloque le téléchargement. Importe un fichier MP4, ou configure les cookies sur le worker puis Relancer."
    );
  }
  if (msg.length > 320) return `${msg.slice(0, 320)}…`;
  return msg;
}

/**
 * Stepper compact du funnel (source → analyse → hooks → rendu).
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
    <div className="rounded-2xl border border-border bg-card/50 px-4 py-4 md:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Progression</p>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${projectStatusTone(status)}`}
        >
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
            !ready &&
            !failed &&
            (current === i || (status === "uploading" && i === 0));
          return (
            <li
              key={step.key}
              className={
                done
                  ? "rounded-xl bg-signal/10 px-3 py-2.5 ring-1 ring-signal/25"
                  : currentStep
                    ? "rounded-xl bg-amber-500/10 px-3 py-2.5 ring-1 ring-amber-500/30"
                    : failed && current >= 0 && i === Math.max(current, 0)
                      ? "rounded-xl bg-destructive/10 px-3 py-2.5 ring-1 ring-destructive/30"
                      : "rounded-xl bg-secondary/40 px-3 py-2.5 opacity-55"
              }
            >
              <p className="text-[11px] text-muted-foreground">Étape {i + 1}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-sm text-muted-foreground">
        {pipelineDetail(status, { readyCount, clipCount })}
      </p>

      {errorMessage && (
        <p
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {friendlyPipelineError(errorMessage)}
        </p>
      )}
    </div>
  );
}

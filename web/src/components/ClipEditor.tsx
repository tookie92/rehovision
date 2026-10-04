"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Scissors, Sparkles } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export type ClipSegment = {
  id: string;
  start: number;
  end: number;
  label: string;
  keep: boolean;
  reason?: string;
};

export type ClipSuggestion = {
  id: string;
  kind: "hook" | "cut" | "zoom" | string;
  title: string;
  description: string;
  start?: number;
  end?: number;
  zoom?: number;
  segmentId?: string;
  segments?: ClipSegment[];
  score?: number;
};

type EditTab = "suggestions" | "manual";

function readProposals(job: Doc<"jobs">): ClipSegment[] {
  const meta = job.resultMeta as { proposals?: ClipSegment[] } | undefined;
  if (!meta?.proposals?.length) return [];
  return meta.proposals.map((s) => ({
    ...s,
    keep: s.keep !== false,
  }));
}

function readSuggestions(job: Doc<"jobs">): ClipSuggestion[] {
  const meta = job.resultMeta as { suggestions?: ClipSuggestion[] } | undefined;
  return meta?.suggestions?.length ? meta.suggestions : [];
}

const KIND_LABEL: Record<string, string> = {
  hook: "Hook",
  cut: "Coupe",
  zoom: "Zoom",
};

export function ClipEditor({
  job,
  sessionId,
  onCreated,
}: {
  job: Doc<"jobs">;
  sessionId: string;
  onCreated?: (message: string) => void;
}) {
  const createJob = useMutation(api.jobs.create);
  const [segments, setSegments] = useState<ClipSegment[]>(() => readProposals(job));
  const [suggestions, setSuggestions] = useState<ClipSuggestion[]>(() =>
    readSuggestions(job),
  );
  const [tab, setTab] = useState<EditTab>(
    () => (readSuggestions(job).length > 0 ? "suggestions" : "manual"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    const sugs = readSuggestions(job);
    const segs = readProposals(job);
    setSegments(segs);
    setSuggestions(sugs);
    if (sugs.length === 0 && segs.length > 0) setTab("manual");
  }, [job]);

  if (!job.resultStorageId || (segments.length === 0 && suggestions.length === 0)) {
    return null;
  }

  const kept = segments.filter((s) => s.keep);
  const sourceTitle = String(
    (job.params as { title?: string; fileName?: string }).title ??
      (job.params as { fileName?: string }).fileName ??
      "clip",
  );

  function toggle(id: string) {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s)),
    );
  }

  /** Source originale du projet (timeline complète), pas le preview hook. */
  const originalSourceId = (
    (job.params as { sourceStorageId?: Id<"_storage"> }).sourceStorageId ||
    job.resultStorageId
  ) as Id<"_storage"> | undefined;

  async function createManualVersion() {
    if (!sessionId || !originalSourceId || kept.length === 0) return;
    setSubmitting(true);
    try {
      await createJob({
        type: "clip_edit",
        sessionId,
        params: {
          parentJobId: job._id,
          sourceStorageId: originalSourceId,
          segments,
          title: `Découpe · ${sourceTitle}`,
          engine: "couche3-hybrid",
        },
      });
      onCreated?.(
        `Version créée à partir de « ${sourceTitle} » (${kept.length} morceau${kept.length > 1 ? "x" : ""}).`,
      );
      document
        .getElementById(`clip-versions-${job._id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec");
    } finally {
      setSubmitting(false);
    }
  }

  async function createFromSuggestion(sug: ClipSuggestion) {
    if (!sessionId || !originalSourceId) return;
    setApplyingId(sug.id);
    try {
      await createJob({
        type: "clip_suggest",
        sessionId,
        params: {
          parentJobId: job._id,
          sourceStorageId: originalSourceId,
          suggestion: sug,
          baseSegments: segments,
          title: `${sug.title} · ${sourceTitle}`,
          engine: "couche4-heuristic",
        },
      });
      onCreated?.(
        `« ${sug.title} » en cours — la nouvelle version apparaîtra sous la source.`,
      );
      document
        .getElementById(`clip-versions-${job._id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 sm:p-4">
      <div>
        <p className="text-sm font-semibold">Créer une version à partir de cette vidéo</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          La vidéo ci-dessus reste intacte. Chaque action crée une{" "}
          <strong className="font-semibold text-[var(--ink)]">nouvelle version</strong>{" "}
          listée juste en dessous.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Mode d'édition"
      >
        {suggestions.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant={tab === "suggestions" ? "default" : "outline"}
            onClick={() => setTab("suggestions")}
            role="tab"
            aria-selected={tab === "suggestions"}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Suggestions
          </Button>
        )}
        {segments.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant={tab === "manual" ? "default" : "outline"}
            onClick={() => setTab("manual")}
            role="tab"
            aria-selected={tab === "manual"}
          >
            <Scissors className="size-3.5" aria-hidden />
            Découpe manuelle
          </Button>
        )}
      </div>

      {tab === "suggestions" && suggestions.length > 0 && (
        <div className="space-y-2" role="tabpanel">
          <p className="text-xs text-[var(--muted)]">
            Choisis une idée proposée — un clic crée la version.
          </p>
          <ul className="space-y-2">
            {suggestions.map((sug) => (
              <li
                key={sug.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <Badge tone="muted" className="mr-2 align-middle">
                      {KIND_LABEL[sug.kind] ?? sug.kind}
                    </Badge>
                    {sug.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {sug.description}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={applyingId !== null}
                  onClick={() => createFromSuggestion(sug)}
                >
                  {applyingId === sug.id ? "Création…" : "Créer cette version"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "manual" && segments.length > 0 && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-xs text-[var(--muted)]">
            Inclure ou exclure chaque morceau, puis créer la version assemblée.
          </p>
          <ul className="space-y-2">
            {segments.map((seg) => (
              <li
                key={seg.id}
                className={
                  seg.keep
                    ? "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5"
                    : "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg-subtle)] px-3 py-2.5 opacity-70"
                }
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {seg.label}{" "}
                    <span className="font-normal text-[var(--muted)]">
                      {seg.start.toFixed(1)}s → {seg.end.toFixed(1)}s
                    </span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {seg.keep ? "Inclus dans la prochaine version" : "Exclu"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={seg.keep ? "default" : "outline"}
                  onClick={() => toggle(seg.id)}
                  aria-pressed={seg.keep}
                >
                  {seg.keep ? "Exclure" : "Inclure"}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            disabled={submitting || kept.length === 0}
            onClick={createManualVersion}
            className="w-full sm:w-auto"
          >
            <Scissors className="size-4" aria-hidden />
            {submitting
              ? "Création…"
              : `Créer la version (${kept.length} morceau${kept.length > 1 ? "x" : ""})`}
          </Button>
        </div>
      )}
    </div>
  );
}

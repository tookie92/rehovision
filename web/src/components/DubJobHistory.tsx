"use client";

import { Fragment, useMemo, useState } from "react";
import type { Doc } from "@convex/_generated/dataModel";
import { LANGUAGES } from "../lib/languages";
import { Badge } from "./ui/badge";
import { MediaByStorage } from "./MediaByStorage";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  queued: "En file",
  running: "Génération",
  done: "Prêt",
  failed: "Erreur",
};

const STATUS_OPTIONS = [
  { id: "all", label: "Tous les statuts" },
  { id: "done", label: "Prêt" },
  { id: "running", label: "En cours" },
  { id: "queued", label: "En file" },
  { id: "failed", label: "Erreur" },
] as const;

function langLabel(code: string | undefined): string {
  if (!code) return "—";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

function jobTitle(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  const text = String(p.text ?? "");
  if (text) return text.length > 64 ? `${text.slice(0, 64)}…` : text;
  return p.sourceStorageId ? "Doublage audio" : "Sans titre";
}

function jobVoiceLabel(job: Doc<"jobs">): string {
  const p = job.params as Record<string, unknown>;
  if (p.voiceMode === "keep" || p.cloneVoice === true) return "Clone";
  if (p.voiceMode === "create") return "Design";
  return "Modèle";
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

export function DubJobHistory({
  jobs,
  loading,
}: {
  jobs: Doc<"jobs">[] | undefined;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["id"]>(
    "all",
  );
  const [lang, setLang] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const langOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const job of jobs ?? []) {
      const p = job.params as Record<string, unknown>;
      if (typeof p.targetLang === "string") codes.add(p.targetLang);
      if (typeof p.sourceLang === "string") codes.add(p.sourceLang);
    }
    return Array.from(codes).sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!jobs?.length) return [];
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (status !== "all" && job.status !== status) return false;
      const p = job.params as Record<string, unknown>;
      if (lang !== "all") {
        const match =
          p.targetLang === lang ||
          p.sourceLang === lang;
        if (!match) return false;
      }
      if (!q) return true;
      const title = jobTitle(job).toLowerCase();
      const meta = `${p.sourceLang ?? ""} ${p.targetLang ?? ""}`.toLowerCase();
      return title.includes(q) || meta.includes(q);
    });
  }, [jobs, query, status, lang]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Historique</h2>
          <p className="text-xs text-[var(--muted)]">
            {filtered.length} rendu{filtered.length !== 1 ? "s" : ""}
            {jobs?.length !== filtered.length && jobs?.length
              ? ` · ${jobs.length} au total`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un script ou une langue…"
          className="min-h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30 sm:min-w-[14rem]"
        />
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as (typeof STATUS_OPTIONS)[number]["id"])
          }
          className="min-h-10 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="min-h-10 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
        >
          <option value="all">Toutes les langues</option>
          {langOptions.map((code) => (
            <option key={code} value={code}>
              {langLabel(code)}
            </option>
          ))}
        </select>
      </div>

      {!jobs?.length ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 py-10 text-center">
          <p className="text-sm font-semibold">Pas encore de rendu</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted)]">
            Prépare un script, choisis une voix, puis génère. Les jobs
            apparaissent ici.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Aucun résultat pour ces filtres.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--muted)]">
                <th className="px-3 py-2.5 font-medium">Script</th>
                <th className="px-3 py-2.5 font-medium">Langues</th>
                <th className="px-3 py-2.5 font-medium">Voix</th>
                <th className="px-3 py-2.5 font-medium">Statut</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const p = job.params as Record<string, unknown>;
                const open = expandedId === job._id;
                return (
                  <Fragment key={job._id}>
                    <tr
                      className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-subtle)]/60"
                    >
                      <td className="max-w-[220px] px-3 py-2.5">
                        <span className="line-clamp-2 font-medium leading-snug">
                          {jobTitle(job)}
                        </span>
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          {job.type}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--muted)]">
                        {langLabel(String(p.sourceLang ?? ""))} →{" "}
                        {langLabel(String(p.targetLang ?? ""))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {jobVoiceLabel(job)}
                        {typeof p.speed === "number"
                          ? ` · ${(p.speed as number).toFixed(2)}×`
                          : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          tone={
                            job.status === "done"
                              ? "ok"
                              : job.status === "failed"
                                ? "danger"
                                : "muted"
                          }
                        >
                          {STATUS_LABEL[job.status] ?? job.status}
                        </Badge>
                        {(job.status === "running" ||
                          job.status === "queued") && (
                          <Progress
                            className="mt-2 h-1"
                            value={job.progress ?? 0}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--muted)]">
                        {relativeTime(job.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(open ? null : job._id)
                          }
                          className="min-h-8 rounded-md border border-[var(--line)] px-2.5 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                        >
                          {open ? "Fermer" : "Détails"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-[var(--bg)]">
                        <td colSpan={6} className="px-3 py-3">
                          {job.status === "failed" && job.error && (
                            <p className="mb-2 text-sm text-[var(--danger)]">
                              {job.error}
                            </p>
                          )}
                          {(() => {
                            const meta = job.resultMeta as
                              | Record<string, unknown>
                              | undefined;
                            const spoken =
                              typeof meta?.spokenText === "string"
                                ? meta.spokenText
                                : "";
                            if (!spoken) return null;
                            return (
                              <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">
                                <span className="font-medium text-[var(--ink)]">
                                  Texte lu :{" "}
                                </span>
                                {spoken.length > 320
                                  ? `${spoken.slice(0, 320)}…`
                                  : spoken}
                              </p>
                            );
                          })()}
                          {job.status === "done" && job.resultStorageId && (
                            <MediaByStorage
                              storageId={job.resultStorageId}
                              kind="audio"
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

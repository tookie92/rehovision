"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { LANGUAGES } from "../lib/languages";

type DubDraft = {
  mode?: "narration" | "doublage";
  text?: string;
  sourceLang?: string;
  targetLang?: string;
  voiceMode?: string;
};

function langLabel(code: string | undefined): string {
  if (!code) return "—";
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

function draftOf(p: Doc<"projects">): DubDraft {
  return (p.draft ?? {}) as DubDraft;
}

export function DubProjectsList({
  sessionId,
  projects,
  loading,
  jobs,
  onOpen,
}: {
  sessionId: string;
  projects: Doc<"projects">[] | undefined;
  loading: boolean;
  jobs: Doc<"jobs">[] | undefined;
  onOpen: (id: Id<"projects">) => void;
}) {
  const createDub = useMutation(api.projects.createDub);
  const removeProject = useMutation(api.projects.remove);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const jobsByProject = useMemo(() => {
    const map = new Map<string, Doc<"jobs">[]>();
    for (const job of jobs ?? []) {
      if (!job.projectId) continue;
      const key = job.projectId;
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!projects?.length) return [];
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const d = draftOf(p);
      return (
        p.title.toLowerCase().includes(q) ||
        (d.text ?? "").toLowerCase().includes(q) ||
        (d.targetLang ?? "").toLowerCase().includes(q)
      );
    });
  }, [projects, query]);

  async function onCreate(mode: "narration" | "doublage") {
    if (!sessionId) return;
    setCreating(true);
    try {
      const id = await createDub({ sessionId, mode });
      onOpen(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec création");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(projectId: Id<"projects">, e: MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Supprimer ce projet ?")) return;
    try {
      await removeProject({ sessionId, projectId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Échec suppression");
    }
  }

  function statusFor(project: Doc<"projects">): {
    label: string;
    tone: "ok" | "danger" | "muted";
  } {
    const linked = jobsByProject.get(project._id) ?? [];
    const active = linked.find(
      (j) => j.status === "running" || j.status === "queued",
    );
    if (active) {
      return {
        label: active.status === "running" ? "Génération" : "En file",
        tone: "muted",
      };
    }
    if (project.latestResultStorageId) {
      return { label: "Prêt", tone: "ok" };
    }
    const failed = linked.find((j) => j.status === "failed");
    if (failed) return { label: "Erreur", tone: "danger" };
    return { label: "Brouillon", tone: "muted" };
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Doublage
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Tes projets. Ouvre-en un pour éditer le script, la voix et générer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={creating || !sessionId}
            onClick={() => void onCreate("narration")}
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius)] bg-[var(--ink)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
            Nouvelle narration
          </button>
          <button
            type="button"
            disabled={creating || !sessionId}
            onClick={() => void onCreate("doublage")}
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-4 text-sm font-semibold hover:bg-[var(--bg-subtle)] disabled:opacity-40"
          >
            Nouveau doublage
          </button>
        </div>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un projet…"
        className="min-h-10 w-full max-w-md rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
      />

      {!projects?.length ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-elevated)] px-6 py-14 text-center">
          <p className="text-base font-semibold">Aucun projet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
            Crée une narration ou un doublage. Chaque projet garde son script,
            sa voix et ses rendus.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Aucun résultat pour « {query} ».
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Projet</th>
                <th className="px-4 py-3 font-medium">Langues</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Modifié</th>
                <th className="px-4 py-3 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const d = draftOf(project);
                const st = statusFor(project);
                return (
                  <tr
                    key={project._id}
                    className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-subtle)]/70"
                    onClick={() => onOpen(project._id)}
                  >
                    <td className="max-w-[280px] px-4 py-3">
                      <span className="block font-semibold tracking-tight">
                        {project.title}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                        {d.text?.trim() || "Sans script"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                      {langLabel(d.sourceLang)} → {langLabel(d.targetLang)}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize">
                      {d.mode === "doublage" ? "Doublage" : "Narration"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                      {relativeTime(project.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        aria-label={`Supprimer ${project.title}`}
                        onClick={(e) => void onDelete(project._id, e)}
                        className="flex size-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

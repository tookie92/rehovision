"use client";

import { useCallback, useMemo, useState } from "react";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ClipProjectCard } from "./ClipProjectCard";
import { Skeleton } from "./ui/skeleton";
import { Toast } from "./ui/toast";

function parentIdOf(job: Doc<"jobs">): Id<"jobs"> | null {
  const p = job.params as { parentJobId?: Id<"jobs"> };
  return p.parentJobId ?? null;
}

export function ClipProjectsList({
  jobs,
  loading,
  sessionId,
}: {
  jobs: Doc<"jobs">[] | undefined;
  loading: boolean;
  sessionId: string;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const dismiss = useCallback(() => setToast(null), []);

  const { parents, versionsByParent, orphans } = useMemo(() => {
    const list = jobs ?? [];
    const parents = list
      .filter((j) => j.type === "clips")
      .sort((a, b) => b.createdAt - a.createdAt);
    const parentIds = new Set(parents.map((p) => p._id));
    const versionsByParent = new Map<Id<"jobs">, Doc<"jobs">[]>();
    const orphans: Doc<"jobs">[] = [];

    for (const j of list) {
      if (
        j.type !== "clip_edit" &&
        j.type !== "clip_suggest" &&
        j.type !== "clip_export"
      )
        continue;
      const pid = parentIdOf(j);
      if (pid && parentIds.has(pid)) {
        const arr = versionsByParent.get(pid) ?? [];
        arr.push(j);
        versionsByParent.set(pid, arr);
      } else {
        orphans.push(j);
      }
    }
    return { parents, versionsByParent, orphans };
  }, [jobs]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!parents.length && !orphans.length) {
    return (
      <p className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-sm text-[var(--muted)]">
        Aucun projet clip pour cette session.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-5">
        {parents.map((parent) => (
          <li key={parent._id}>
            <ClipProjectCard
              parent={parent}
              versions={versionsByParent.get(parent._id) ?? []}
              sessionId={sessionId}
              onVersionCreated={setToast}
            />
          </li>
        ))}
      </ul>
      {orphans.length > 0 && (
        <p className="mt-4 text-xs text-[var(--muted)]">
          {orphans.length} version(s) sans projet parent visible (ancienne
          session).
        </p>
      )}
      <Toast message={toast} onDismiss={dismiss} />
    </>
  );
}

"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Download } from "lucide-react";

export function AudioByStorage({ storageId }: { storageId: Id<"_storage"> }) {
  const url = useQuery(api.jobs.getFileUrl, { storageId });
  if (url === undefined) {
    return (
      <div className="h-10 animate-pulse rounded-lg bg-[var(--bg-subtle)]" aria-label="Chargement audio" />
    );
  }
  if (!url) {
    return <p className="text-sm text-[var(--danger)]">Fichier indisponible</p>;
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <audio controls src={url} className="w-full max-w-md" />
      <a
        href={url}
        download
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--ink)] underline underline-offset-2 transition-opacity hover:opacity-70"
      >
        <Download className="size-4" aria-hidden />
        Télécharger
      </a>
    </div>
  );
}

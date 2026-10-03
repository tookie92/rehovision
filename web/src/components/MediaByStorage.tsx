"use client";

import { useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Skeleton } from "./ui/skeleton";

export function MediaByStorage({
  storageId,
  kind = "audio",
}: {
  storageId: Id<"_storage">;
  kind?: "audio" | "video";
}) {
  const url = useQuery(api.jobs.getFileUrl, { storageId });
  if (url === undefined) {
    return <Skeleton className="h-10 w-full max-w-md" />;
  }
  if (!url) {
    return <p className="text-sm text-[var(--danger)]">Fichier indisponible</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {kind === "video" ? (
        <video
          controls
          src={url}
          className="max-h-80 w-full max-w-md rounded-xl bg-black"
          playsInline
        />
      ) : (
        <audio controls src={url} className="w-full max-w-md" />
      )}
      <a
        href={url}
        download
        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-[var(--ink)] underline underline-offset-2 transition-opacity duration-200 hover:opacity-70"
      >
        <Download className="size-4" aria-hidden />
        Télécharger
      </a>
    </div>
  );
}

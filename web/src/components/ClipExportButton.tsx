"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Smartphone } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "./ui/button";

export function ClipExportButton({
  sessionId,
  parentJobId,
  sourceStorageId,
  title,
  onCreated,
}: {
  sessionId: string;
  parentJobId: Id<"jobs">;
  sourceStorageId: Id<"_storage">;
  title?: string;
  onCreated?: (message: string) => void;
}) {
  const createJob = useMutation(api.jobs.create);
  const [busy, setBusy] = useState(false);

  async function onExport() {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      await createJob({
        type: "clip_export",
        sessionId,
        params: {
          parentJobId,
          sourceStorageId,
          captions: true,
          aspect: "9:16",
          title: title ? `${title} · Reel 9:16` : "Export Reel 9:16",
          engine: "export-916",
        },
      });
      onCreated?.("Export Reel 9:16 + captions lancé");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec export");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void onExport()}
      className="mt-2"
    >
      <Smartphone className="size-3.5" aria-hidden />
      {busy ? "Lancement…" : "Exporter Reel 9:16 + captions"}
    </Button>
  );
}

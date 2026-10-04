"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Sparkles, Smartphone } from "lucide-react";
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
  const [busy, setBusy] = useState<"fast" | "hf" | null>(null);

  async function onExport(engine: "export-916" | "hyperframes") {
    if (!sessionId || busy) return;
    setBusy(engine === "hyperframes" ? "hf" : "fast");
    try {
      const isHf = engine === "hyperframes";
      await createJob({
        type: "clip_export",
        sessionId,
        params: {
          parentJobId,
          sourceStorageId,
          captions: true,
          aspect: "9:16",
          title: title
            ? isHf
              ? `${title} · HyperFrames`
              : `${title} · Reel 9:16`
            : isHf
              ? "Polish HyperFrames"
              : "Export Reel 9:16",
          engine,
        },
      });
      onCreated?.(
        isHf
          ? "Polish HyperFrames lancé"
          : "Export Reel 9:16 + captions lancé",
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec export");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void onExport("export-916")}
      >
        <Smartphone className="size-3.5" aria-hidden />
        {busy === "fast" ? "Lancement…" : "Exporter 9:16 + captions"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => void onExport("hyperframes")}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {busy === "hf" ? "Lancement…" : "Polish HyperFrames"}
      </Button>
    </div>
  );
}

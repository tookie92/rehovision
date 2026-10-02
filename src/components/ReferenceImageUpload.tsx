"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type StudioProps = {
  mode?: "studio";
  studioId: Id<"studios">;
  projectId?: never;
  referenceImageUrl?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onChanged?: () => void;
};

type ProjectProps = {
  mode: "project";
  projectId: Id<"videoProjects">;
  studioId?: never;
  referenceImageUrl?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onChanged?: () => void;
};

type Props = StudioProps | ProjectProps;

/**
 * Upload d'une référence de STYLE DE DESSIN.
 * Mode projet : worker SDXL + IP-Adapter.
 * Mode studio : legacy / global (secondaire).
 */
export function ReferenceImageUpload(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.studios.generateUploadUrl);
  const setStudioRef = useMutation(api.studios.setReferenceImage);
  const clearStudioRef = useMutation(api.studios.clearReferenceImage);
  const setProjectRef = useMutation(api.videoProjects.setProjectStyleReference);
  const clearProjectRef = useMutation(
    api.videoProjects.clearProjectStyleReference,
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProject = props.mode === "project";
  const referenceImageUrl = props.referenceImageUrl;
  const disabled = Boolean(props.disabled) || pending;
  const compact = Boolean(props.compact);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image (PNG, JPG, WebP…).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image trop lourde (max 8 Mo).");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) {
        throw new Error(`Upload échoué (${result.status})`);
      }
      const { storageId } = (await result.json()) as {
        storageId: Id<"_storage">;
      };
      if (isProject) {
        await setProjectRef({
          projectId: props.projectId,
          storageId,
        });
      } else {
        await setStudioRef({ studioId: props.studioId, storageId });
      }
      props.onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'upload");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onClear() {
    setError(null);
    setPending(true);
    try {
      if (isProject) {
        await clearProjectRef({ projectId: props.projectId });
      } else {
        await clearStudioRef({ studioId: props.studioId });
      }
      props.onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  const inputId = isProject
    ? "project-style-reference-image"
    : "studio-reference-image";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div>
        <Label htmlFor={inputId}>
          {isProject
            ? "Style (image de référence)"
            : "Style de dessin (référence image) — legacy"}
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          {isProject
            ? "Upload ta ref (clay, comic, polar…) — les images s’adaptent via SDXL + IP-Adapter."
            : "Global studio — préfère l’upload dans Ajuster du projet."}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div
          className={
            compact
              ? "relative flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40"
              : "relative flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40"
          }
        >
          {referenceImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referenceImageUrl}
              alt="Référence style"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon
              className="size-7 text-muted-foreground"
              aria-hidden
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "default"}
            className="cursor-pointer gap-2 self-start"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {pending
              ? "Envoi…"
              : referenceImageUrl
                ? "Remplacer"
                : "Uploader"}
          </Button>
          {referenceImageUrl && (
            <Button
              type="button"
              variant="ghost"
              size={compact ? "sm" : "default"}
              className="cursor-pointer gap-2 self-start text-muted-foreground"
              disabled={disabled}
              onClick={() => void onClear()}
            >
              <X className="size-4" aria-hidden />
              Retirer
            </Button>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

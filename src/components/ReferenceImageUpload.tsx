"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { ImageIcon, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  studioId: Id<"studios">;
  referenceImageUrl?: string | null;
};

/**
 * Upload d'une référence de STYLE DE DESSIN (ex. anime, aquarelle).
 * N'impose pas le contenu / personnage sur chaque scène.
 */
export function ReferenceImageUpload({ studioId, referenceImageUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.studios.generateUploadUrl);
  const setReferenceImage = useMutation(api.studios.setReferenceImage);
  const clearReferenceImage = useMutation(api.studios.clearReferenceImage);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await setReferenceImage({ studioId, storageId });
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
      await clearReferenceImage({ studioId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="studio-reference-image">
          Style de dessin (référence image) — optionnel
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Prioritaire sur le preset texte : anime, comic, aquarelle… Chaque
          scène reprend ce trait / ces couleurs, avec un décor et des
          personnages nouveaux (la photo n’est jamais recollée).
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="relative flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {referenceImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referenceImageUrl}
              alt="Référence studio"
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon
              className="size-8 text-muted-foreground"
              aria-hidden
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            id="studio-reference-image"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={pending}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer gap-2 self-start"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {pending
              ? "Envoi…"
              : referenceImageUrl
                ? "Remplacer"
                : "Uploader une image"}
          </Button>
          {referenceImageUrl && (
            <Button
              type="button"
              variant="ghost"
              className="cursor-pointer gap-2 self-start text-muted-foreground"
              disabled={pending}
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

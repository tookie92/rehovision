"use client";

import { Mic2, Play, Trash2, Wand2 } from "lucide-react";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  PUBLIC_VOICES,
  publicVoiceTags,
  type PublicVoice,
} from "../lib/publicVoices";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export type VoiceShelf = "public" | "mine";

type Props = {
  shelf: VoiceShelf;
  onShelfChange: (shelf: VoiceShelf) => void;
  selectedPublicId: string | null;
  selectedVoiceId: Id<"voices"> | null;
  savedVoices: Doc<"voices">[] | undefined;
  onSelectPublic: (voice: PublicVoice) => void;
  onSelectSaved: (voice: Doc<"voices">) => void;
  onDeleteSaved: (voiceId: Id<"voices">) => void;
  onPlayPublic: (voice: PublicVoice) => void;
  onPlaySaved: (voice: Doc<"voices">) => void;
  playLoading: boolean;
  onCreateDesign: () => void;
  onCreateClone: () => void;
};

function TagRow({ tags, active }: { tags: string[]; active: boolean }) {
  if (!tags.length) return null;
  const unique = Array.from(new Set(tags));
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {unique.slice(0, 6).map((tag, i) => (
        <li
          key={`${tag}-${i}`}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
            active
              ? "bg-white/15 text-white/80"
              : "bg-[var(--bg-subtle)] text-[var(--muted)]",
          )}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function VoiceCatalog({
  shelf,
  onShelfChange,
  selectedPublicId,
  selectedVoiceId,
  savedVoices,
  onSelectPublic,
  onSelectSaved,
  onDeleteSaved,
  onPlayPublic,
  onPlaySaved,
  playLoading,
  onCreateDesign,
  onCreateClone,
}: Props) {
  const mineCount = savedVoices?.length ?? 0;

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Catalogue de voix"
        className="flex rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg)] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={shelf === "public"}
          onClick={() => onShelfChange("public")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            shelf === "public"
              ? "bg-[var(--bg-elevated)] text-[var(--ink)] shadow-[var(--shadow)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]",
          )}
        >
          Voix publiques ({PUBLIC_VOICES.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={shelf === "mine"}
          onClick={() => onShelfChange("mine")}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
            shelf === "mine"
              ? "bg-[var(--bg-elevated)] text-[var(--ink)] shadow-[var(--shadow)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]",
          )}
        >
          Mes voix ({mineCount})
        </button>
      </div>

      {shelf === "public" && (
        <>
          <p className="text-xs text-[var(--muted)]">
            Recettes OmniVoice génériques (genre, âge, timbre). Pas de clones
            célébrités.
          </p>
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {PUBLIC_VOICES.map((voice) => {
              const on = selectedPublicId === voice.id;
              return (
                <li key={voice.id}>
                  <div
                    className={cn(
                      "flex items-stretch gap-2 rounded-[var(--radius)] border p-2 transition-colors",
                      on
                        ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                        : "border-[var(--line)] bg-[var(--bg-elevated)] hover:border-[var(--line-strong)]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPublic(voice)}
                      className="min-w-0 flex-1 px-2 py-1.5 text-left"
                    >
                      <span className="block text-sm font-semibold">
                        {voice.name}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-xs",
                          on ? "text-white/65" : "text-[var(--muted)]",
                        )}
                      >
                        {voice.blurb}
                      </span>
                      <TagRow tags={publicVoiceTags(voice)} active={on} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Écouter ${voice.name}`}
                      disabled={playLoading}
                      onClick={() => onPlayPublic(voice)}
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center self-center rounded-full transition-colors disabled:opacity-40",
                        on
                          ? "bg-[var(--signal)] text-white hover:opacity-90"
                          : "bg-[var(--accent-soft)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white",
                      )}
                    >
                      <Play className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {shelf === "mine" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCreateDesign}
            >
              <Wand2 className="size-3.5" aria-hidden />
              Créer une voix
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCreateClone}
            >
              <Mic2 className="size-3.5" aria-hidden />
              Cloner ma voix
            </Button>
          </div>

          {savedVoices === undefined ? (
            <p className="text-xs text-[var(--muted)]">Chargement…</p>
          ) : savedVoices.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--bg)] px-4 py-8 text-center">
              <p className="text-sm font-semibold">Aucune voix sauvegardée</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--muted)]">
                Compose une voix (Voice Lab) ou clone un échantillon avec
                consentement, puis enregistre-la ici.
              </p>
            </div>
          ) : (
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {savedVoices.map((voice) => {
                const on = selectedVoiceId === voice._id;
                const tags =
                  voice.kind === "design"
                    ? [
                        "Design",
                        ...(voice.gender === "female"
                          ? ["Femme"]
                          : voice.gender === "male"
                            ? ["Homme"]
                            : []),
                        ...(typeof voice.speed === "number"
                          ? [`${voice.speed.toFixed(2)}×`]
                          : []),
                      ]
                    : [
                        "Clone",
                        ...(typeof voice.speed === "number"
                          ? [`${voice.speed.toFixed(2)}×`]
                          : []),
                      ];
                return (
                  <li key={voice._id}>
                    <div
                      className={cn(
                        "relative flex items-stretch gap-2 rounded-[var(--radius)] border p-2 transition-colors",
                        on
                          ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                          : "border-[var(--line)] bg-[var(--bg-elevated)] hover:border-[var(--line-strong)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSaved(voice)}
                        className="min-w-0 flex-1 px-2 py-1.5 pr-8 text-left"
                      >
                        <span className="block text-sm font-semibold">
                          {voice.name}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block text-xs",
                            on ? "text-white/65" : "text-[var(--muted)]",
                          )}
                        >
                          {voice.kind === "design"
                            ? voice.instruct || "Voice Lab"
                            : "Échantillon cloné"}
                        </span>
                        <TagRow tags={tags} active={on} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Écouter ${voice.name}`}
                        disabled={playLoading}
                        onClick={() => onPlaySaved(voice)}
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center self-center rounded-full transition-colors disabled:opacity-40",
                          on
                            ? "bg-[var(--signal)] text-white hover:opacity-90"
                            : "bg-[var(--accent-soft)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white",
                        )}
                      >
                        <Play className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Supprimer ${voice.name}`}
                        onClick={() => onDeleteSaved(voice._id)}
                        className={cn(
                          "absolute right-2 top-2 flex size-7 items-center justify-center rounded-md transition-colors",
                          on
                            ? "text-white/70 hover:bg-white/10 hover:text-white"
                            : "text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--danger)]",
                        )}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

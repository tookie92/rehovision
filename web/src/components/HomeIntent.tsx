"use client";

import {
  AudioLines,
  BookOpen,
  Clapperboard,
  Languages,
  type LucideIcon,
} from "lucide-react";
import type { AppTab } from "./AppSidebar";

const INTENTS: {
  id: Exclude<AppTab, "home" | "library">;
  title: string;
  blurb: string;
  icon: LucideIcon;
}[] = [
  {
    id: "clips",
    title: "Clips",
    blurb: "Vlog vers hooks verticaux prêts à poster.",
    icon: Clapperboard,
  },
  {
    id: "dub",
    title: "Doublage",
    blurb: "Narration et voix locales avec consentement.",
    icon: Languages,
  },
  {
    id: "music",
    title: "Musique",
    blurb: "Ambiances générées pour sous-titrer ta voix.",
    icon: AudioLines,
  },
  {
    id: "audiobook",
    title: "Livre audio",
    blurb: "Chapitres et multi-voix, langues sous-servies.",
    icon: BookOpen,
  },
];

export function HomeIntent({
  onChoose,
}: {
  onChoose: (tab: AppTab) => void;
}) {
  return (
    <section className="space-y-8">
      <div className="max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Que veux-tu faire ?
        </h1>
        <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-[var(--muted)]">
          Doublage, clips et musique en local. Un rendu à la fois.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {INTENTS.map(({ id, title, blurb, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onChoose(id)}
              className="group flex h-full w-full items-start gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 text-left transition-colors duration-200 hover:border-[var(--ink)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)] active:scale-[0.99]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--ink)] transition-colors group-hover:bg-[var(--ink)] group-hover:text-white">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-base font-semibold tracking-tight">
                  {title}
                </span>
                <span className="mt-1 block text-sm leading-snug text-[var(--muted)]">
                  {blurb}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { useStudioSessionId } from "../lib/useStudioSessionId";
import { AppSidebar, type AppTab } from "../components/AppSidebar";
import { ClipsPanel } from "../components/ClipsPanel";
import { AudiobookPanel } from "../components/AudiobookPanel";
import { DubPanel } from "../components/DubPanel";
import { MusicPanel } from "../components/MusicPanel";
import { MediaByStorage } from "../components/MediaByStorage";
import { ConvexStatusBanner } from "../components/ConvexStatusBanner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar";
import { Badge } from "../components/ui/badge";

type Tab = AppTab;

const KIND_LABEL: Record<string, string> = {
  preset: "Preset",
  music: "Musique",
  audiobook: "Livre audio",
  dub: "Doublage",
  narration: "Narration",
  clip: "Clip",
};

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("dub");
  const sessionId = useStudioSessionId();

  const jobs = useQuery(
    api.jobs.listBySession,
    sessionId ? { sessionId, limit: 80 } : "skip",
  );
  const libraryPresets = useQuery(
    api.library.list,
    tab === "music" ? {} : "skip",
  );
  const unifiedLibrary = useQuery(
    api.library.listForSession,
    tab === "library" && sessionId ? { sessionId } : "skip",
  );

  const filteredJobs =
    jobs?.filter((j) => {
      if (tab === "music") return j.type === "music";
      if (tab === "dub") return j.type === "dub" || j.type === "narration";
      if (tab === "audiobook") return j.type === "audiobook";
      if (tab === "clips")
        return (
          j.type === "clips" ||
          j.type === "clip_edit" ||
          j.type === "clip_suggest" ||
          j.type === "clip_export"
        );
      return true;
    }) ?? undefined;

  const libraryGroups = useMemo(() => {
    if (!unifiedLibrary?.length) return [];
    const order = ["audiobook", "dub", "narration", "music", "clip", "preset"];
    const grouped = new Map<string, typeof unifiedLibrary>();
    for (const item of unifiedLibrary) {
      const list = grouped.get(item.kind) ?? [];
      list.push(item);
      grouped.set(item.kind, list);
    }
    return order
      .filter((k) => grouped.has(k))
      .map((k) => ({ kind: k, items: grouped.get(k)! }));
  }, [unifiedLibrary]);

  return (
    <SidebarProvider>
      <a
        href="#studio-main"
        className="absolute left-4 top-4 z-[60] -translate-y-16 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white opacity-0 transition-[transform,opacity] duration-200 focus:translate-y-0 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
      >
        Aller au contenu
      </a>
      <AppSidebar tab={tab} onTabChange={setTab} />
      <SidebarInset id="studio-main">
        <ConvexStatusBanner />
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-elevated)]/90 px-4 py-3 backdrop-blur-sm sm:px-6">
          <SidebarTrigger />
          <div className="min-w-0 lg:hidden">
            <p className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
              Rehovision
            </p>
          </div>
          <p className="ml-auto hidden text-xs text-[var(--muted)] sm:block">
            GPU local · 1 job à la fois
          </p>
        </header>

        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:py-10">
          {tab === "clips" && (
            <ClipsPanel
              sessionId={sessionId}
              jobs={filteredJobs}
              jobsLoading={!sessionId || jobs === undefined}
            />
          )}

          {tab === "dub" && (
            <DubPanel
              sessionId={sessionId}
              jobs={filteredJobs}
              jobsLoading={!sessionId || jobs === undefined}
            />
          )}

          {tab === "audiobook" && (
            <AudiobookPanel
              sessionId={sessionId}
              jobs={filteredJobs}
              jobsLoading={!sessionId || jobs === undefined}
            />
          )}

          {tab === "music" && (
            <MusicPanel
              sessionId={sessionId}
              jobs={filteredJobs}
              jobsLoading={!sessionId || jobs === undefined}
              libraryPresets={libraryPresets}
            />
          )}

          {tab === "library" && (
            <section className="space-y-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Bibliothèque
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Presets musique, livres audio, doublages, clips et tracks de
                  votre session.
                </p>
              </div>
              {unifiedLibrary === undefined ? (
                <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--bg-subtle)]" />
              ) : unifiedLibrary.length === 0 ? (
                <p className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--muted)]">
                  Vide pour l&apos;instant. Génère une piste, un livre audio ou
                  un doublage — les outputs terminés apparaîtront ici.
                </p>
              ) : (
                <div className="space-y-8">
                  {libraryGroups.map(({ kind, items }) => (
                    <div key={kind} className="space-y-3">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {KIND_LABEL[kind] ?? kind}
                      </h2>
                      <ul className="space-y-3">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)]"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-medium">{item.title}</p>
                              <Badge tone="muted">{KIND_LABEL[item.kind]}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {item.subtitle}
                            </p>
                            <div className="mt-3">
                              <MediaByStorage
                                storageId={item.storageId}
                                kind={
                                  item.kind === "clip" ? "video" : "audio"
                                }
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

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
import { HomeIntent } from "../components/HomeIntent";
import { StudioStage } from "../components/StudioStage";
import { MediaByStorage } from "../components/MediaByStorage";
import { ConvexStatusBanner } from "../components/ConvexStatusBanner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

type Tab = AppTab;

const KIND_LABEL: Record<string, string> = {
  preset: "Preset",
  music: "Musique",
  audiobook: "Livre audio",
  dub: "Doublage",
  narration: "Narration",
  clip: "Clip",
};

const STAGE_TABS = new Set<Tab>(["clips", "dub", "music", "audiobook"]);

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("home");
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

  const showStage = STAGE_TABS.has(tab) && tab !== "dub";
  const dubLayout = tab === "dub";

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
            Un rendu à la fois · quelques minutes
          </p>
        </header>

        <div
          className={
            dubLayout
              ? "w-full space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6"
              : showStage
                ? "grid w-full gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:px-8 lg:py-6 xl:grid-cols-[minmax(0,1fr)_340px]"
                : tab === "home"
                  ? "mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:py-10"
                  : "w-full space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6"
          }
        >
          <div className="min-w-0 space-y-8">
            {tab === "home" && <HomeIntent onChoose={setTab} />}

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
                    Tout ce que tu as généré. Réécoute, réutilise, continue.
                  </p>
                </div>
                {unifiedLibrary === undefined ? (
                  <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--bg-subtle)]" />
                ) : unifiedLibrary.length === 0 ? (
                  <div className="rounded-[var(--radius)] border border-dashed border-[var(--line-strong)] bg-[var(--bg-elevated)] px-6 py-12 text-center">
                    <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
                      Ta bibliothèque est vide
                    </p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
                      Lance un doublage, un clip ou une piste. Les résultats
                      terminés s&apos;accumulent ici.
                    </p>
                    <Button
                      type="button"
                      className="mt-6"
                      onClick={() => setTab("home")}
                    >
                      Choisir une intention
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {libraryGroups.map(({ kind, items }) => (
                      <div key={kind} className="space-y-3">
                        <h2 className="text-sm font-semibold text-[var(--muted)]">
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
                                <Badge tone="muted">
                                  {KIND_LABEL[item.kind]}
                                </Badge>
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

          {showStage && (
            <div className="lg:sticky lg:top-20 lg:self-start">
              <StudioStage
                tab={tab}
                jobs={filteredJobs}
                loading={!sessionId || jobs === undefined}
              />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

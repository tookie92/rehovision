"use client";

import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  BookOpen,
  Clapperboard,
  Languages,
  Library,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

export type AppTab = "dub" | "audiobook" | "clips" | "music" | "library";

const NAV: { id: AppTab; label: string; icon: LucideIcon }[] = [
  { id: "dub", label: "Doublage", icon: Languages },
  { id: "audiobook", label: "Livre audio", icon: BookOpen },
  { id: "clips", label: "Clips", icon: Clapperboard },
  { id: "music", label: "Musique", icon: AudioLines },
  { id: "library", label: "Bibliothèque", icon: Library },
];

export function AppSidebar({
  tab,
  onTabChange,
}: {
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";

  return (
    <Sidebar aria-label="Navigation studio">
      <SidebarHeader>
        {collapsed ? (
          <span
            className="flex size-10 items-center justify-center rounded-xl bg-[var(--ink)] font-[family-name:var(--font-display)] text-sm font-semibold text-white"
            title="Rehovision"
            aria-label="Rehovision"
          >
            R
          </span>
        ) : (
          <>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--ink)]">
              Rehovision
            </p>
            <p className="text-xs text-[var(--muted)]">Studio voix & musique</p>
          </>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Création</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map(({ id, label, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  type="button"
                  isActive={tab === id}
                  tooltip={label}
                  onClick={() => {
                    onTabChange(id);
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate group-data-[state=collapsed]:hidden">
                    {label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {collapsed ? (
          <span
            className="mx-auto flex size-2.5 rounded-full bg-[var(--warn-ink)]"
            title="Aucune authentification — ne pas exposer publiquement"
            aria-label="Avertissement : aucune authentification"
          />
        ) : (
          <>
            <p className="rounded-xl border border-[var(--warn-line)] bg-[var(--warn-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--warn-ink)]">
              Aucune authentification. Ne pas exposer publiquement avant Convex
              Auth ou équivalent.
            </p>
            <p className="px-1 pt-2 text-[11px] text-[var(--muted)]">
              GPU local · 1 job à la fois
            </p>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

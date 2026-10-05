"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
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
import { Button } from "./ui/button";

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
        <Show when="signed-in">
          <div
            className={
              collapsed
                ? "flex justify-center"
                : "flex items-center gap-3 px-1"
            }
          >
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-9",
                },
              }}
            />
            {!collapsed && (
              <p className="min-w-0 text-[11px] text-[var(--muted)]">
                Compte Clerk · GPU local
              </p>
            )}
          </div>
        </Show>
        <Show when="signed-out">
          {collapsed ? (
            <SignInButton mode="modal">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mx-auto"
              >
                In
              </Button>
            </SignInButton>
          ) : (
            <div className="flex flex-col gap-2">
              <SignInButton mode="modal">
                <Button type="button" size="sm" className="w-full">
                  Connexion
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                >
                  Créer un compte
                </Button>
              </SignUpButton>
            </div>
          )}
        </Show>
      </SidebarFooter>
    </Sidebar>
  );
}

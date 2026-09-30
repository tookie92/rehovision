"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "@phosphor-icons/react";

/**
 * Chrome atelier — clips + entrée Studio faceless.
 */
export function DashboardNav() {
  const pathname = usePathname();
  const onClipsHome =
    pathname === "/dashboard" || pathname === "/dashboard/clips";
  const onClipProject = pathname.startsWith("/dashboard/clips/");
  const onStudio =
    pathname === "/dashboard/studios" ||
    pathname.startsWith("/dashboard/studios/");

  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1" aria-label="Atelier">
        <Link
          href="/dashboard"
          className={
            onClipsHome && !onClipProject
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Clips
        </Link>
        <Link
          href="/dashboard/studios"
          className={
            onStudio
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Faceless
        </Link>
        {onClipProject && (
          <>
            <span className="px-1 text-muted-foreground/40" aria-hidden>
              /
            </span>
            <span className="truncate px-2 py-2 text-sm text-muted-foreground">
              Projet
            </span>
          </>
        )}
      </nav>
      {!onClipsHome || onClipProject || onStudio ? (
        <Link
          href="/dashboard"
          className="cta-signal inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-[filter] hover:brightness-105"
        >
          <Plus className="size-4" weight="bold" />
          Nouveau clip
        </Link>
      ) : null}
    </div>
  );
}

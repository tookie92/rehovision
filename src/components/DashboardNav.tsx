"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "@phosphor-icons/react";

/**
 * Chrome atelier — Clips | Faceless (hub create), pas Studios.
 */
function DashboardNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const onClipProject = pathname.startsWith("/dashboard/clips/");
  const onStudioProject = pathname.startsWith("/dashboard/studios/");
  const onStudiosList = pathname === "/dashboard/studios";

  const onDashboardHome =
    pathname === "/dashboard" || pathname === "/dashboard/clips";
  const onFacelessHub =
    (onDashboardHome && tab === "faceless") || onStudioProject;
  const onClipsHub =
    onDashboardHome && tab !== "faceless" && !onClipProject;

  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1" aria-label="Atelier">
        <Link
          href="/dashboard"
          className={
            onClipsHub
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Clips
        </Link>
        <Link
          href="/dashboard?tab=faceless"
          className={
            onFacelessHub
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Faceless
        </Link>
        {(onClipProject || onStudioProject) && (
          <>
            <span className="px-1 text-muted-foreground/40" aria-hidden>
              /
            </span>
            <span className="truncate px-2 py-2 text-sm text-muted-foreground">
              Projet
            </span>
          </>
        )}
        {onStudiosList && (
          <>
            <span className="px-1 text-muted-foreground/40" aria-hidden>
              /
            </span>
            <span className="truncate px-2 py-2 text-sm text-muted-foreground">
              Studios
            </span>
          </>
        )}
      </nav>
      {onClipProject || onStudioProject || onStudiosList ? (
        <Link
          href={
            onStudioProject || onStudiosList
              ? "/dashboard?tab=faceless"
              : "/dashboard"
          }
          className="cta-signal inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-[filter] hover:brightness-105"
        >
          <Plus className="size-4" weight="bold" />
          {onStudioProject || onStudiosList ? "Nouveau reel" : "Nouveau clip"}
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardNav() {
  return (
    <Suspense
      fallback={
        <div className="mb-8 h-9 w-48 animate-pulse rounded-lg bg-secondary/60" />
      }
    >
      <DashboardNavInner />
    </Suspense>
  );
}

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "@phosphor-icons/react";

/**
 * Chrome atelier clips only — faceless gelé (priorité cash Étape 0).
 */
function DashboardNavInner() {
  const pathname = usePathname();
  const onClipProject = pathname.startsWith("/dashboard/clips/");
  const onDashboardHome =
    pathname === "/dashboard" || pathname === "/dashboard/clips";

  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1" aria-label="Atelier">
        <Link
          href="/dashboard"
          className={
            onDashboardHome && !onClipProject
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Clips
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
      {onClipProject ? (
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

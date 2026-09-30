"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "@phosphor-icons/react";

/**
 * Chrome atelier — simple, 1 job : nouveaux projets + retour liste.
 */
export function DashboardNav() {
  const pathname = usePathname();
  const onProject = pathname.startsWith("/dashboard/clips/");
  const onHome = pathname === "/dashboard" || pathname === "/dashboard/clips";

  return (
    <div className="mb-8 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1" aria-label="Atelier">
        <Link
          href="/dashboard"
          className={
            onHome && !onProject
              ? "rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
              : "rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          Projets
        </Link>
        {onProject && (
          <span className="px-1 text-muted-foreground/40" aria-hidden>
            /
          </span>
        )}
        {onProject && (
          <span className="truncate px-2 py-2 text-sm text-muted-foreground">
            Projet
          </span>
        )}
      </nav>
      {!onHome || onProject ? (
        <Link
          href="/dashboard"
          className="cta-signal inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-[filter] hover:brightness-105"
        >
          <Plus className="size-4" weight="bold" />
          Nouveau
        </Link>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/dashboard",
    label: "Import",
    match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/clips"),
  },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-10 flex flex-wrap gap-1 border-b border-border pb-3">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground"
                : "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

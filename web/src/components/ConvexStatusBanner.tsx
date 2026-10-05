"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";

/** Alerte si Convex met trop longtemps à répondre (backend down ou tunnel). */
export function ConvexStatusBanner() {
  const ping = useQuery(api.health.ping);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (ping !== undefined) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 4500);
    return () => window.clearTimeout(timer);
  }, [ping]);

  if (!slow) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 sm:text-sm"
    >
      Convex met du temps à répondre — vérifiez que le backend local tourne (
      <code className="rounded bg-white/70 px-1">docker compose up -d</code>
      ).
    </div>
  );
}

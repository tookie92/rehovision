"use client";

import { useEffect, useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Attend que Convex ait validé le JWT Clerk avant les queries protégées.
 * Timeout visible si AuthLoading reste coincé (JWT template / issuer / réseau).
 */
export function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setStuck(true), 8000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <AuthLoading>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          {stuck && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <p className="font-medium">Auth Convex bloquée</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Vérifie l&apos;intégration Clerk → Convex (JWT{" "}
                <code className="text-foreground">aud: convex</code>),{" "}
                <code className="text-foreground">CLERK_FRONTEND_API_URL</code>{" "}
                sur le backend Convex (
                <code className="text-foreground">npm run convex:env:clerk</code>
                ), redéploie, puis redémarre{" "}
                <code className="text-foreground">npm run dev</code>.
              </p>
              <Link
                href="/sign-in"
                className="mt-2 inline-block text-xs underline hover:text-foreground"
              >
                Reconnecter
              </Link>
            </div>
          )}
        </div>
      </AuthLoading>
      <Unauthenticated>
        <p className="text-sm text-muted-foreground">
          Session Convex non prête.{" "}
          <Link href="/sign-in" className="underline hover:text-foreground">
            Reconnecter
          </Link>
        </p>
      </Unauthenticated>
      <Authenticated>{children}</Authenticated>
    </>
  );
}

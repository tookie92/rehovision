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
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium">Auth Convex bloquée</p>
              <p className="mt-1 text-xs opacity-90">
                Clerk doit émettre un JWT{" "}
                <code className="rounded bg-background/60 px-1">aud: convex</code>{" "}
                (template JWT nommé{" "}
                <code className="rounded bg-background/60 px-1">convex</code>
                ). Issuer ={" "}
                <code className="rounded bg-background/60 px-1">
                  CLERK_FRONTEND_API_URL
                </code>{" "}
                dans{" "}
                <code className="rounded bg-background/60 px-1">
                  convex/auth.config.ts
                </code>
                . Puis{" "}
                <code className="rounded bg-background/60 px-1">
                  npm run convex:deploy:self-hosted
                </code>{" "}
                + restart web, et{" "}
                <strong className="font-medium">reconnecte-toi</strong> (nouveau
                token).
              </p>
              <Link
                href="/sign-in"
                className="mt-2 inline-block text-xs underline hover:opacity-100"
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

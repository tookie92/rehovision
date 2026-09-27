"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Attend que Convex ait validé le JWT Clerk avant les queries protégées.
 */
export function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Skeleton className="h-40 w-full" />
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

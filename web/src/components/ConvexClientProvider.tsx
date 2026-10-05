"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { SyncClerkUser } from "./SyncClerkUser";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL manquant");
    }
    return new ConvexReactClient(url);
  }, []);

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <SyncClerkUser />
      {children}
    </ConvexProviderWithClerk>
  );
}

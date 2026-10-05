"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { getSessionId, linkSessionToClerk } from "./session";

/**
 * Session atelier : localStorage immédiat, puis bascule sur l’id Clerk si connecté.
 */
export function useStudioSessionId(): string {
  const { isLoaded, isSignedIn, user } = useUser();
  const [sessionId, setSessionId] = useState(() =>
    typeof window !== "undefined" ? getSessionId() : "",
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user?.id) {
      linkSessionToClerk(user.id);
      setSessionId(user.id);
      return;
    }
    setSessionId(getSessionId());
  }, [isLoaded, isSignedIn, user?.id]);

  return sessionId;
}

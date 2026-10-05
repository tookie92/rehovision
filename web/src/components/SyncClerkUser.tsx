"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@convex/_generated/api";

/** Upsert l’utilisateur Clerk dans la table Convex `users`. */
export function SyncClerkUser() {
  const { isSignedIn, user } = useUser();
  const store = useMutation(api.users.store);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !user) return;
    if (lastId.current === user.id) return;
    lastId.current = user.id;
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      undefined;
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.fullName ||
      user.username ||
      undefined;
    void store({
      clerkId: user.id,
      email,
      name: name || undefined,
      imageUrl: user.imageUrl || undefined,
    }).catch((err) => {
      console.error("users.store failed", err);
      lastId.current = null;
    });
  }, [isSignedIn, user, store]);

  return null;
}

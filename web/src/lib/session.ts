/**
 * Identité provisoire côté navigateur.
 * Plus tard : remplacer par l'identité utilisateur (Convex Auth).
 */
const KEY = "rehovision_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** Lie la session navigateur au compte Clerk (jobs persistants par user). */
export function linkSessionToClerk(clerkId: string): void {
  if (typeof window === "undefined" || !clerkId) return;
  const prev = localStorage.getItem(KEY);
  if (prev === clerkId) return;
  localStorage.setItem(KEY, clerkId);
}

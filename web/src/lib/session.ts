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

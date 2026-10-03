/**
 * AVERTISSEMENT : Aucune authentification utilisateur.
 * WORKER_TOKEN protège uniquement les endpoints worker.
 * Plus tard : remplacer sessionId par identity.subject (Convex Auth / Clerk).
 */
import { ConvexError } from "convex/values";

export function assertWorkerToken(token: string) {
  const expected = process.env.WORKER_TOKEN;
  if (!expected || token !== expected) {
    throw new ConvexError("Unauthorized worker");
  }
}

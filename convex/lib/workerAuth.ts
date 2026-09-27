/**
 * Vérification de la clé secrète partagée avec le worker Python.
 */
export function assertWorkerSecret(request: Request): void {
  const expected = process.env.WORKER_SECRET_KEY;
  if (!expected) {
    throw new Error("WORKER_SECRET_KEY non configurée sur Convex");
  }

  const provided =
    request.headers.get("x-worker-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!provided || provided !== expected) {
    throw new Error("UNAUTHORIZED_WORKER");
  }
}

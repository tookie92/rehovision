import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Identité Clerk de l'utilisateur courant.
 * `subject` = userId Clerk (stable).
 */
export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Non authentifié");
  }
  return identity;
}

/** userId Clerk de l'utilisateur authentifié. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await requireIdentity(ctx);
  return identity.subject;
}

import { query } from "./_generated/server";

/** Ping léger pour détecter un backend Convex injoignable. */
export const ping = query({
  args: {},
  handler: async () => ({ ok: true as const, ts: Date.now() }),
});

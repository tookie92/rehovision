/**
 * Fichier placeholder — les mutations/queries métier arrivent à l'étape 3.
 * Nécessaire pour que le codegen Convex génère correctement l'API.
 */
import { query } from "./_generated/server";

export const health = query({
  args: {},
  handler: async () => {
    return { ok: true, product: "rehovision" };
  },
});

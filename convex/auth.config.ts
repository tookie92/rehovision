import type { AuthConfig } from "convex/server";

/**
 * Auth JWT Clerk → Convex (self-hosted).
 * @see https://docs.convex.dev/auth/clerk
 * @see https://clerk.com/docs/guides/development/integrations/databases/convex
 *
 * Convex valide `aud === applicationID` ("convex") + issuer = `domain`.
 * Self-hosted : `npx convex env set` → 404 → issuer en dur (Frontend API URL).
 * Requis côté Clerk : JWT template nommé **convex** avec claim `"aud": "convex"`
 * (ou intégration Convex activée → session token avec aud).
 */
const CLERK_FAPI =
  process.env.CLERK_FRONTEND_API_URL ||
  process.env.CLERK_JWT_ISSUER_DOMAIN ||
  "https://distinct-marten-9832.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: CLERK_FAPI.replace(/\/$/, ""),
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

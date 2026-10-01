import type { AuthConfig } from "convex/server";

/**
 * Auth JWT Clerk → Convex
 * @see https://clerk.com/docs/guides/development/integrations/databases/convex
 *
 * Doc cloud : `domain: process.env.CLERK_FRONTEND_API_URL!` + `npx convex env set`.
 * Self-hosted Rehovision : l’API `env set` renvoie 404 → issuer en dur
 * (= Frontend API URL / ancien CLERK_JWT_ISSUER_DOMAIN).
 * `applicationID: "convex"` = claim `aud` du JWT (intégration Convex Clerk).
 */
export default {
  providers: [
    {
      domain: "https://distinct-marten-9832.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

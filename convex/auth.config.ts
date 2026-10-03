import type { AuthConfig } from "convex/server";

/**
 * Auth JWT Clerk → Convex (self-hosted).
 * @see https://docs.convex.dev/auth/clerk
 *
 * Issuer = Clerk Frontend API URL (identique à CLERK_FRONTEND_API_URL dans .env.local).
 * En dur : self-hosted `convex env set` / analyse process.env casse souvent le deploy.
 * `applicationID: "convex"` = claim JWT `aud` (template Clerk nommé « convex »).
 *
 * Garantir le template : `npm run clerk:ensure-convex`
 */
export default {
  providers: [
    {
      domain: "https://distinct-marten-9832.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

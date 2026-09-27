import { AuthConfig } from "convex/server";

/**
 * Validation des JWT Clerk côté Convex.
 * Activer l'intégration Convex dans le Clerk Dashboard, puis définir
 * CLERK_JWT_ISSUER_DOMAIN (Frontend API URL) sur le déploiement Convex.
 * @see https://docs.convex.dev/auth/clerk
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

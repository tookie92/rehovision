/**
 * Clerk JWT → Convex auth.
 * Requires Clerk JWT template named "convex" (aud claim = "convex").
 * Override issuer via CLERK_JWT_ISSUER_DOMAIN on the Convex deployment.
 */
export default {
  providers: [
    {
      domain:
        process.env.CLERK_JWT_ISSUER_DOMAIN ??
        "https://distinct-marten-9832.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

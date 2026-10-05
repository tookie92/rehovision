import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Next.js 15 → fichier `middleware.ts`.
 * Sur Next.js 16+, renommer en `proxy.ts` (même contenu) — doc Clerk 2026.
 */
export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  const isPublic =
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/__clerk");
  if (!isPublic) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

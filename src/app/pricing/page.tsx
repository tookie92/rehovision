import Link from "next/link";

/**
 * Tarifs early-access — pas de Clerk Billing (désactivé).
 */
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:px-10">
      <p className="timecode text-xs text-signal">EARLY ACCESS</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">
        Gratuit pour l’instant
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Quotas et paiements Clerk Billing sont désactivés. Tu peux générer des
        reels et découper des clips sans limite pendant cette phase.
      </p>
      <Link
        href="/sign-up"
        className="mt-10 inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Ouvrir l’atelier
      </Link>
    </main>
  );
}

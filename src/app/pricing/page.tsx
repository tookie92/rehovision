import { PricingTable } from "@clerk/nextjs";

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 md:px-10">
      <div className="mb-12 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Tarifs
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl tracking-tight sm:text-5xl">
          Solo, Studio ou Agence
        </h1>
        <p className="mt-4 text-muted-foreground">
          La différence porte sur le nombre de Studios et le quota de vidéos par
          mois — pas sur les fonctionnalités.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Active Clerk Billing et crée les plans <code>solo</code>,{" "}
          <code>studio</code>, <code>agence</code> dans le Dashboard pour
          afficher la table.
        </p>
      </div>
      <PricingTable />
    </main>
  );
}

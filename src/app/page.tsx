import Link from "next/link";

/**
 * Landing — une composition, brand hero, esthétique narrative sombre.
 */
export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      {/* Atmosphère : grain + dégradé cramoisi/charbon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 70% 20%, oklch(0.35 0.14 25 / 0.45), transparent 55%),
            radial-gradient(ellipse 50% 40% at 10% 80%, oklch(0.25 0.06 40 / 0.35), transparent 50%),
            linear-gradient(165deg, oklch(0.12 0.02 40) 0%, oklch(0.09 0.01 30) 45%, oklch(0.07 0.015 25) 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <section className="mx-auto flex min-h-[calc(100vh-4.5rem)] max-w-5xl flex-col justify-center px-6 pb-24 pt-10 md:px-10">
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.28em] text-[oklch(0.72_0.12_35)] animate-in fade-in duration-700">
          Rehovision
        </p>
        <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[1.05] tracking-tight text-balance text-foreground sm:text-6xl md:text-7xl animate-in fade-in slide-in-from-bottom-3 duration-700">
          Un sujet. Une vidéo narrative illustrée.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground text-pretty animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-150">
          Script, illustrations cohérentes, voix off et montage — pour TikTok,
          YouTube et Instagram. Style true crime, mystère, faceless.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3 animate-in fade-in duration-1000 delay-300">
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Créer un Studio
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-background/40 px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Voir les tarifs
          </Link>
        </div>
      </section>

      <section className="border-t border-white/5 bg-black/20 px-6 py-20 md:px-10">
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Le sujet",
              body: "Tu entres un titre. Rehovision écrit le script narratif découpé en scènes.",
            },
            {
              step: "02",
              title: "L’univers",
              body: "Chaque Studio garde son style d’illustration et son ton de narration.",
            },
            {
              step: "03",
              title: "La vidéo",
              body: "Images, voix off, sous-titres et montage — assemblés pour le format vertical.",
            },
          ].map((item) => (
            <div key={item.step} className="space-y-3">
              <p className="font-mono text-xs tracking-widest text-[oklch(0.65_0.14_25)]">
                {item.step}
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-foreground">
                {item.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

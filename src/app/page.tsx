import Link from "next/link";

/**
 * Landing Opus Clip — brand + cadre 9:16. Un job : importer une source.
 */
export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <section className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-6xl items-center gap-12 px-6 pb-20 pt-8 md:grid-cols-[1.1fr_0.9fr] md:px-10 md:pb-24">
        <div className="relative z-10">
          <p className="mb-5 font-display text-5xl tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Rehovision
          </p>
          <h1 className="max-w-xl text-xl leading-snug text-muted-foreground sm:text-2xl">
            Colle un lien YouTube ou importe une vidéo. On sort des clips
            verticaux prêts à poster.
          </h1>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Ouvrir l’atelier
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-5 text-sm text-muted-foreground transition-colors hover:border-signal/40 hover:text-foreground"
            >
              Importer une source
            </Link>
          </div>
        </div>

        <div
          className="relative mx-auto flex h-[min(70vh,560px)] w-[min(100%,280px)] items-end justify-center"
          aria-hidden
        >
          <div className="absolute inset-0 rounded-[2rem] border border-border bg-card/60 shadow-[inset_0_0_0_1px_rgb(61_214_198_/_0.12)]" />
          <div className="absolute left-1/2 top-3 h-1.5 w-16 -translate-x-1/2 rounded-full bg-muted-foreground/25" />
          <div className="absolute inset-x-4 bottom-8 top-10 overflow-hidden rounded-2xl bg-[#07090c]">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgb(61_214_198_/_0.08)_50%,transparent_100%)]" />
            <div className="absolute left-3 right-3 top-[18%] space-y-2">
              <p className="timecode text-[10px] text-signal">
                youtube.com/watch?v=…
              </p>
              <p className="font-display text-lg leading-tight text-foreground">
                Hooks trouvés
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Transcription → sélection → coupe 9:16.
              </p>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-4 left-3 right-3">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[38%] bg-signal" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";

/**
 * Landing = même mental model que l’atelier :
 * Import → Clips → Export, preview 9:16 au centre.
 */
export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <section className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1400px] flex-col px-4 pb-10 pt-6 md:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-5xl leading-none tracking-tight text-foreground sm:text-6xl md:text-7xl">
              Rehovision
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Atelier clips : source → hooks IA → polish → export 9:16 prêt à
              poster.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="timecode h-7 rounded-lg border-signal/35 bg-signal/10 px-3 text-[10px] text-signal"
            >
              Import · Clips · Export
            </Badge>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-10 cursor-pointer px-5",
              )}
            >
              Ouvrir l’atelier
            </Link>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-10 cursor-pointer px-5",
              )}
            >
              Importer une source
            </Link>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/40 shadow-[inset_0_1px_0_rgb(247_249_247_/_0.06)] lg:grid-cols-[200px_minmax(0,1fr)_220px]">
          <aside className="hidden flex-col border-b border-border p-3 lg:flex lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Clips
            </p>
            <ul className="space-y-2">
              {[
                { n: "01", t: "Hook produit", s: 92, on: true },
                { n: "02", t: "Objection prix", s: 81, on: false },
                { n: "03", t: "Preuve sociale", s: 74, on: false },
              ].map((c) => (
                <li
                  key={c.n}
                  className={
                    c.on
                      ? "rounded-xl border border-signal/45 bg-signal/10 px-2.5 py-2"
                      : "rounded-xl border border-border bg-background/30 px-2.5 py-2"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{c.t}</p>
                    <span className="timecode shrink-0 text-[10px] text-signal">
                      {c.s}
                    </span>
                  </div>
                  <p className="timecode mt-1 text-[10px] text-muted-foreground">
                    {c.n} · ~30s
                  </p>
                </li>
              ))}
            </ul>
          </aside>

          <div className="relative flex min-h-[420px] flex-col items-center justify-center gap-3 bg-background/40 p-4 sm:min-h-[480px]">
            <div className="relative aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-[#0a2a1c] shadow-[0_0_0_1px_rgb(146_255_95_/_0.12)]">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_20%,rgb(146_255_95_/_0.07)_55%,transparent_100%)]" />
              <div className="absolute left-2 top-2 rounded-md bg-background/70 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-signal backdrop-blur-sm">
                Soft · viral
              </div>
              <div className="absolute inset-x-3 top-[22%] space-y-2 text-center">
                <p className="timecode text-[10px] text-ice">00:12 – 00:42</p>
                <p className="text-xl font-extrabold uppercase tracking-wide text-foreground [text-shadow:0_2px_0_#0f3b27]">
                  Launching a
                  <br />
                  <span className="text-signal">new product</span>
                </p>
              </div>
              <div className="absolute inset-x-3 bottom-10">
                <div className="h-1 overflow-hidden rounded-full bg-ice/15">
                  <div className="h-full w-[42%] bg-signal" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex justify-between text-[10px] text-muted-foreground">
                <span className="timecode">SOFT</span>
                <span className="timecode">9:16</span>
              </div>
            </div>
            <p className="max-w-[240px] text-center text-[11px] leading-relaxed text-muted-foreground">
              Soft = aperçu navigateur immédiat. Export = vrai rendu ffmpeg.
            </p>
          </div>

          <aside className="flex flex-col border-t border-border p-3 lg:border-l lg:border-t-0">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Outils
            </p>
            <div className="space-y-4 overflow-y-auto">
              <ToolRow
                label="Sous-titres"
                chips={["Viral", "Impact", "Off"]}
                active="Viral"
              />
              <ToolRow
                label="Cadre"
                chips={["Smart", "Fill", "Split"]}
                active="Split"
              />
              <ToolRow
                label="Look"
                chips={["Warm", "Cool", "Off"]}
                active="Warm"
              />
              <Separator className="bg-border" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Change un preset → soft live. Puis{" "}
                <span className="font-medium text-foreground">Re-rendre</span>{" "}
                pour le MP4 final.
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2.5">
          <span className="timecode text-[10px] text-muted-foreground">
            00:00 · IN / OUT
          </span>
          <Badge variant="secondary" className="rounded-md text-[10px]">
            TikTok
          </Badge>
          <Badge variant="outline" className="rounded-md text-[10px]">
            Reels
          </Badge>
          <Badge variant="outline" className="rounded-md text-[10px]">
            Shorts
          </Badge>
          <div className="ml-auto">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-8 cursor-pointer",
              )}
            >
              Commencer un projet
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ToolRow({
  label,
  chips,
  active,
}: {
  label: string;
  chips: string[];
  active: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span
            key={c}
            className={
              c === active
                ? "rounded-md bg-signal/20 px-2 py-1 text-[11px] font-medium text-signal ring-1 ring-signal/40"
                : "rounded-md bg-secondary/80 px-2 py-1 text-[11px] text-muted-foreground"
            }
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

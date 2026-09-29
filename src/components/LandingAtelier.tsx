"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, Scissors } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const CLIPS = [
  { n: "01", t: "Hook produit", s: 92 },
  { n: "02", t: "Objection prix", s: 81 },
  { n: "03", t: "Preuve sociale", s: 74 },
] as const;

/**
 * Landing « atelier live » — preview animée du workspace clips.
 * Public jeune créateurs · Soft White / Move Green · 1 CTA.
 */
export function LandingAtelier() {
  const [active, setActive] = useState(0);
  const [soft, setSoft] = useState(true);
  const [progress, setProgress] = useState(18);
  const [motionOk, setMotionOk] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionOk(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!motionOk) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % CLIPS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [motionOk]);

  useEffect(() => {
    if (!motionOk) return;
    const id = window.setInterval(() => {
      setSoft((v) => !v);
    }, 2800);
    return () => window.clearInterval(id);
  }, [motionOk]);

  useEffect(() => {
    if (!motionOk) return;
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? 12 : p + 7));
    }, 700);
    return () => window.clearInterval(id);
  }, [motionOk]);

  const clip = CLIPS[active]!;

  return (
    <main className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 70% 45% at 85% 0%, color-mix(in oklab, var(--signal) 22%, transparent), transparent 60%),
            radial-gradient(ellipse 50% 40% at 0% 90%, color-mix(in oklab, var(--ice) 18%, transparent), transparent 55%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.055]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <section className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-[1400px] flex-col px-4 pb-8 pt-5 md:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-5 md:mb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <Badge
              variant="outline"
              className="mb-4 h-7 gap-1.5 rounded-full border-signal/40 bg-signal/10 px-3 font-mono text-[10px] tracking-wide text-signal"
            >
              <Scissors className="size-3" weight="bold" aria-hidden />
              Pour créateurs · Reels / TikTok / Shorts
            </Badge>
            <h1 className="font-display text-[clamp(2.85rem,9vw,5.75rem)] leading-[0.9] text-foreground">
              Rehovision
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              Colle ta vidéo. L’IA coupe les moments forts. Tu polishes en soft,
              tu postes en 9:16.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group h-12 min-h-11 cursor-pointer gap-2 px-6 text-base font-semibold transition-transform duration-200 active:scale-[0.98]",
              )}
            >
              Ouvrir l’atelier
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                weight="bold"
              />
            </Link>
            <p className="px-1 text-xs leading-snug text-muted-foreground sm:max-w-[11rem]">
              Gratuit pour démarrer · soft preview avant rendu
            </p>
          </div>
        </header>

        {/* Mobile clip picker */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {CLIPS.map((c, i) => {
            const on = i === active;
            return (
              <button
                key={c.n}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "min-h-11 shrink-0 cursor-pointer rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                  on
                    ? "border-signal/50 bg-signal/15"
                    : "border-border bg-card/60",
                )}
              >
                <p className="text-sm font-semibold">{c.t}</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {c.n} · {c.s}
                </p>
              </button>
            );
          })}
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/50 shadow-[0_24px_60px_-28px_rgb(15_59_39_/_0.35)] backdrop-blur-sm dark:bg-card/35 dark:shadow-[0_24px_60px_-24px_rgb(0_0_0_/_0.55)] lg:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside className="hidden flex-col border-b border-border p-3 lg:flex lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Clips
            </p>
            <ul className="space-y-2" role="listbox" aria-label="Aperçu clips">
              {CLIPS.map((c, i) => {
                const on = i === active;
                return (
                  <li key={c.n}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => setActive(i)}
                      className={cn(
                        "min-h-11 w-full cursor-pointer rounded-xl border px-2.5 py-2.5 text-left transition-all duration-200",
                        on
                          ? "border-signal/50 bg-signal/15 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--signal)_25%,transparent)]"
                          : "border-border bg-background/40 hover:border-signal/25",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug">
                          {c.t}
                        </p>
                        <span
                          className={cn(
                            "font-mono text-[10px] tabular-nums transition-colors",
                            on ? "text-signal" : "text-muted-foreground",
                          )}
                        >
                          {c.s}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {c.n} · ~30s
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="relative flex min-h-[420px] flex-col items-center justify-center gap-4 bg-background/50 p-4 sm:min-h-[500px]">
            <div
              className="relative aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-[1.25rem] border border-border bg-[color-mix(in_oklab,var(--background)_40%,#0a2a1c)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--signal)_18%,transparent)]"
              aria-live="polite"
            >
              <div
                className="absolute inset-0 opacity-80 transition-opacity duration-500"
                style={{
                  backgroundImage: soft
                    ? "linear-gradient(180deg, transparent 15%, color-mix(in oklab, var(--signal) 14%, transparent) 50%, transparent 85%)"
                    : "linear-gradient(180deg, transparent 40%, rgb(0 0 0 / 0.35) 100%)",
                }}
              />

              <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors duration-300",
                    soft
                      ? "bg-signal text-signal-foreground"
                      : "bg-foreground/90 text-background",
                  )}
                >
                  {soft ? "Soft" : "Final"}
                </span>
                <span className="rounded-md bg-background/70 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
                  {clip.n}
                </span>
              </div>

              <div className="absolute inset-x-3 top-[20%] space-y-3 text-center">
                <p className="font-mono text-[10px] text-ice">
                  00:12 – 00:42
                </p>
                <p
                  key={`${clip.t}-${soft}`}
                  className="font-display text-[1.4rem] font-extrabold uppercase leading-[1.05] tracking-wide text-foreground duration-300 [text-shadow:0_2px_0_color-mix(in_oklab,var(--background)_80%,#0f3b27)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
                >
                  {soft ? (
                    <>
                      Hook{" "}
                      <span className="text-signal">{clip.t.split(" ")[0]}</span>
                      <br />
                      ready to post
                    </>
                  ) : (
                    <>
                      Export
                      <br />
                      <span className="text-signal">9:16</span> locked
                    </>
                  )}
                </p>
              </div>

              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background/90 to-transparent" />
              <div className="absolute bottom-4 left-3 right-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Play className="size-3 text-signal" weight="fill" aria-hidden />
                  <span className="font-mono tabular-nums">
                    {String(Math.floor(progress / 3)).padStart(2, "0")}:
                    {String((progress * 2) % 60).padStart(2, "0")}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ice/20">
                  <div
                    className="h-full rounded-full bg-signal transition-[width] duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <p className="max-w-[280px] text-center text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Soft</span> = aperçu
              immédiat.{" "}
              <span className="font-medium text-foreground">Re-rendre</span> =
              vrai MP4.
            </p>
          </div>

          <aside className="flex flex-col border-t border-border p-3 lg:border-l lg:border-t-0">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Outils
            </p>
            <div className="space-y-4">
              <ChipRow
                label="Sous-titres"
                chips={["Viral", "Impact", "Off"]}
                active={soft ? "Viral" : "Impact"}
              />
              <ChipRow
                label="Cadre"
                chips={["Smart", "Fill", "Split"]}
                active="Split"
              />
              <ChipRow
                label="Look"
                chips={["Warm", "Cool", "Off"]}
                active={soft ? "Warm" : "Cool"}
              />
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Les presets bougent en soft. Un clic{" "}
                <span className="font-semibold text-foreground">Re-rendre</span>{" "}
                et c’est prêt à poster.
              </p>
            </div>
          </aside>
        </div>

        <footer className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5">
          <span className="font-mono text-[10px] text-muted-foreground">
            IN / OUT · drag
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
          <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
            Score {clip.s} · clip {clip.n}
          </span>
        </footer>
      </section>
    </main>
  );
}

function ChipRow({
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
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-300",
              c === active
                ? "bg-signal/20 text-signal ring-1 ring-signal/40"
                : "bg-secondary/80 text-muted-foreground",
            )}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

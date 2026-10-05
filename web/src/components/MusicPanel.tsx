"use client";

import { useMutation } from "convex/react";
import { FormEvent, useMemo, useState } from "react";
import {
  AudioLines,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Dices,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { JobList } from "./JobList";
import { MediaByStorage } from "./MediaByStorage";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

type Props = {
  sessionId: string;
  jobs: Doc<"jobs">[] | undefined;
  jobsLoading: boolean;
  libraryPresets?: Doc<"library">[] | undefined;
};

const PRESETS: { id: string; label: string; caption: string }[] = [
  {
    id: "lofi",
    label: "Lo-fi",
    caption:
      "Lo-fi hip-hop chill, soft drums, warm Rhodes, dusty vinyl, calm study vibe",
  },
  {
    id: "afro",
    label: "Afrobeat",
    caption:
      "Afrobeat groove, live percussion, bright guitar, joyful energy, danceable",
  },
  {
    id: "cine",
    label: "Ciné",
    caption:
      "Cinematic ambient, wide pads, subtle strings, emotional underscore for video",
  },
  {
    id: "trap",
    label: "Trap calme",
    caption:
      "Modern trap beat, soft 808, sparse hi-hats, moody night atmosphere",
  },
  {
    id: "afrohouse",
    label: "Afro-house",
    caption:
      "Afro-house, deep kick, shakers, melodic synth, late-night club warmth",
  },
  {
    id: "folk",
    label: "Folk",
    caption:
      "Acoustic folk, fingerpicked guitar, light percussion, intimate storytelling mood",
  },
];

const LYRICS_PLACEHOLDER = `[Verse]
Write real sung lines here, not only tags…
[Chorus]
A short catchy hook…`;

function stripInstrumentalBias(caption: string): string {
  let c = caption
    .replace(/\binstrumentals?\b/gi, "")
    .replace(/\b(no|without|sans)\s+vocals?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;-]+|[\s,;-]+$/g, "");
  if (!/\b(vocal|vocals|sing|sung|chant|voice|voix)\b/i.test(c)) {
    c = `${c}, with clear sung vocals`.replace(/^,\s*/, "");
  }
  return c;
}

export function MusicPanel({
  sessionId,
  jobs,
  jobsLoading,
  libraryPresets,
}: Props) {
  const [caption, setCaption] = useState(
    "Ambiance lo-fi calme pour vlog, drums soft, Rhodes chaud",
  );
  const [instrumental, setInstrumental] = useState(true);
  const [lyrics, setLyrics] = useState("");
  const [durationS, setDurationS] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bpm, setBpm] = useState("");
  const [seed, setSeed] = useState("");
  const [keyscale, setKeyscale] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const createJob = useMutation(api.jobs.create);
  const saveToLibrary = useMutation(api.library.saveFromJob);
  const library = libraryPresets;
  const [saving, setSaving] = useState(false);

  const latest = useMemo(() => {
    if (!jobs?.length) return undefined;
    return [...jobs].sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [jobs]);

  const canSubmit =
    !!sessionId &&
    caption.trim().length > 0 &&
    (instrumental || lyrics.trim().length > 0);

  async function submit(opts?: { variant?: boolean }) {
    if (!canSubmit || !sessionId) return;
    setSubmitting(true);
    try {
      let nextSeed: number | undefined;
      if (opts?.variant) {
        nextSeed = Math.floor(Math.random() * 2_147_483_647);
        setSeed(String(nextSeed));
      } else if (seed.trim()) {
        const n = Number(seed);
        if (Number.isFinite(n)) nextSeed = Math.floor(n);
      }

      const bpmN = bpm.trim() ? Number(bpm) : undefined;

      const promptOut = instrumental
        ? caption.trim()
        : stripInstrumentalBias(caption.trim());

      await createJob({
        type: "music",
        sessionId,
        params: {
          prompt: promptOut,
          durationS,
          instrumental,
          ...(instrumental
            ? { lyrics: "[Instrumental]" }
            : { lyrics: lyrics.trim() }),
          ...(nextSeed !== undefined ? { seed: nextSeed } : {}),
          ...(bpmN !== undefined && Number.isFinite(bpmN)
            ? { bpm: Math.min(300, Math.max(30, Math.floor(bpmN))) }
            : {}),
          ...(keyscale.trim() ? { keyscale: keyscale.trim() } : {}),
          engine: "acestep",
        },
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Échec envoi");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    await submit();
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Musique
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Ambiance → option paroles → générer. ACE-Step local, une piste à la
          fois.
        </p>
      </div>

      <form
        onSubmit={onGenerate}
        className="space-y-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Presets</legend>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setCaption(
                    instrumental
                      ? p.caption
                      : stripInstrumentalBias(p.caption),
                  )
                }
                className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-medium transition-colors hover:bg-[var(--bg-subtle)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        {library && library.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Partir de la bibliothèque</legend>
            <div className="flex flex-wrap gap-2">
              {library.slice(0, 6).map((item) => (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => setCaption(item.prompt)}
                  className="min-h-11 max-w-full truncate rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-left text-xs font-medium transition-colors hover:bg-[var(--bg-subtle)]"
                  title={item.prompt}
                >
                  {item.title || item.mood}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block space-y-2">
          <span className="text-sm font-medium">Ambiance (caption)</span>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            required
            className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[15px] leading-relaxed outline-none transition-shadow duration-200 focus:ring-2 focus:ring-[var(--signal)]/30"
            placeholder="genre · mood · instruments · usage…"
          />
          <p className="text-xs text-[var(--muted)]">
            Ex. « Afrobeat groove, live percussion, bright guitar »
          </p>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Voix</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setInstrumental(true)}
              className={
                instrumental
                  ? "min-h-14 rounded-xl bg-[var(--ink)] px-4 py-3 text-left text-sm font-semibold text-white"
                  : "min-h-14 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left text-sm font-medium hover:bg-[var(--bg-subtle)]"
              }
            >
              Instrumental
              <span
                className={
                  instrumental
                    ? "mt-0.5 block text-xs font-normal text-white/70"
                    : "mt-0.5 block text-xs font-normal text-[var(--muted)]"
                }
              >
                Pas de chant · [Instrumental]
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInstrumental(false);
                setCaption((c) => stripInstrumentalBias(c));
                if (durationS < 60) setDurationS(60);
              }}
              className={
                !instrumental
                  ? "min-h-14 rounded-xl bg-[var(--ink)] px-4 py-3 text-left text-sm font-semibold text-white"
                  : "min-h-14 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-left text-sm font-medium hover:bg-[var(--bg-subtle)]"
              }
            >
              Avec paroles
              <span
                className={
                  !instrumental
                    ? "mt-0.5 block text-xs font-normal text-white/70"
                    : "mt-0.5 block text-xs font-normal text-[var(--muted)]"
                }
              >
                Vrai texte chanté · 60s+ conseillé
              </span>
            </button>
          </div>
        </fieldset>

        {!instrumental && (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Paroles (lyrics)</span>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={8}
              required
              className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
              placeholder={LYRICS_PLACEHOLDER}
            />
            <p className="text-xs text-[var(--muted)]">
              Les tags seuls ne chantent pas — écris des phrases. Ex. [Verse] /
              [Chorus]. 60s+ pour verse+chorus.
            </p>
          </label>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Durée</legend>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 60, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationS(d)}
                className={
                  durationS === d
                    ? "min-h-11 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-white"
                    : "min-h-11 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)]"
                }
              >
                {d}s
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {showAdvanced ? (
              <ChevronUp className="size-4" aria-hidden />
            ) : (
              <ChevronDown className="size-4" aria-hidden />
            )}
            Options avancées
          </button>
          {showAdvanced && (
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">BPM</span>
                <input
                  type="number"
                  min={30}
                  max={300}
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  placeholder="auto"
                  className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Tonalité</span>
                <input
                  value={keyscale}
                  onChange={(e) => setKeyscale(e.target.value)}
                  placeholder="ex. Am, C Major"
                  className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Seed</span>
                <div className="flex gap-2">
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="aléatoire"
                    className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
                  />
                  <button
                    type="button"
                    aria-label="Nouveau seed"
                    onClick={() =>
                      setSeed(String(Math.floor(Math.random() * 2_147_483_647)))
                    }
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-white hover:bg-[var(--bg-subtle)]"
                  >
                    <Dices className="size-4" aria-hidden />
                  </button>
                </div>
              </label>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto sm:min-w-[200px]"
        >
          <Sparkles className="size-4" aria-hidden />
          {submitting ? "Envoi…" : "Générer"}
        </button>
      </form>

      {latest && (
        <section className="space-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Résultat
              </p>
              <p className="mt-1 text-sm font-medium leading-snug">
                {String(
                  (latest.params as { prompt?: string }).prompt ?? "Musique",
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {(latest.params as { durationS?: number }).durationS ?? "?"}s
                {" · "}
                {(latest.params as { instrumental?: boolean }).instrumental !==
                false
                  ? "Instrumental"
                  : "Avec paroles"}
                {(latest.params as { bpm?: number }).bpm
                  ? ` · ${(latest.params as { bpm?: number }).bpm} BPM`
                  : ""}
              </p>
            </div>
            <Badge
              tone={
                latest.status === "done"
                  ? "ok"
                  : latest.status === "failed"
                    ? "danger"
                    : "muted"
              }
            >
              {latest.status === "done"
                ? "Prêt"
                : latest.status === "failed"
                  ? "Erreur"
                  : latest.status === "running"
                    ? "Génération"
                    : "En file"}
            </Badge>
          </div>

          {(latest.status === "running" || latest.status === "queued") && (
            <Progress value={latest.progress ?? 0} />
          )}
          {latest.status === "failed" && latest.error && (
            <p className="text-sm text-[var(--danger)]">{latest.error}</p>
          )}
          {latest.status === "done" && latest.resultStorageId && (
            <div className="space-y-3">
              <MediaByStorage storageId={latest.resultStorageId} kind="audio" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting || !canSubmit}
                  onClick={() => void submit()}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Regénérer
                </button>
                <button
                  type="button"
                  disabled={submitting || !canSubmit}
                  onClick={() => void submit({ variant: true })}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <Dices className="size-4" aria-hidden />
                  Variante
                </button>
                <button
                  type="button"
                  disabled={saving || !sessionId}
                  onClick={async () => {
                    if (!latest?._id || !sessionId) return;
                    setSaving(true);
                    try {
                      await saveToLibrary({
                        sessionId,
                        jobId: latest._id,
                        mood: "music",
                      });
                    } catch (err) {
                      alert(
                        err instanceof Error
                          ? err.message
                          : "Échec sauvegarde biblio",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <BookmarkPlus className="size-4" aria-hidden />
                  {saving ? "Sauvegarde…" : "Bibliothèque"}
                </button>
              </div>
            </div>
          )}
          {!latest.resultStorageId &&
            (latest.status === "queued" || latest.status === "running") && (
              <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <AudioLines className="size-4 animate-pulse" aria-hidden />
                ACE-Step travaille sur le GPU…
              </p>
            )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historique</h2>
        <JobList jobs={jobs} loading={jobsLoading} />
      </section>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  LANGUAGES,
  langLabel,
  langSupport,
  languageSuggestions,
  normalizeLangCode,
  supportHint,
} from "../lib/languages";

export function LangPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(
    () => languageSuggestions(query || value, 36),
    [query, value],
  );
  const support = langSupport(value);

  function pick(code: string) {
    onChange(code);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative block space-y-2">
      <span className="text-sm font-medium">{label}</span>

      <div className="flex flex-wrap gap-1.5">
        {LANGUAGES.slice(0, 4).map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => pick(l.code)}
            className={
              value === l.code
                ? "min-h-9 rounded-lg bg-[var(--ink)] px-2.5 text-xs font-semibold text-white"
                : "min-h-9 rounded-lg border border-[var(--line)] bg-white px-2.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]"
            }
          >
            {l.code === "wo" || l.code === "wof" ? l.label : l.label.split(" (")[0]}
          </button>
        ))}
      </div>

      <input
        value={open || query ? query : langLabel(value)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          const code = normalizeLangCode(e.target.value);
          if (code.length >= 2 && code.length <= 8 && /^[a-z]+$/.test(code)) {
            onChange(code);
          }
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => {
          // laisse le click suggestion passer
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder="Rechercher une langue (Wolof, Shona, yo…)"
        className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--signal)]/30"
        autoComplete="off"
      />

      {open && (
        <ul
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow)]"
          role="listbox"
        >
          {suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--muted)]">
              Aucun résultat
            </li>
          )}
          {suggestions.map((s) => (
            <li key={s.code}>
              <button
                type="button"
                className="flex min-h-10 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-[var(--bg-subtle)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.code)}
              >
                <span>{s.label}</span>
                <span className="shrink-0 text-[11px] text-[var(--muted)]">
                  {s.code}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted)]">
        {langLabel(value)}
        {" · "}
        <span
          className={
            support === "fragile" || support === "off"
              ? "text-[var(--warn-ink)]"
              : undefined
          }
        >
          {supportHint(support)}
        </span>
      </p>
    </div>
  );
}

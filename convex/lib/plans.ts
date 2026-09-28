/**
 * Quotas par plan Clerk Billing (B2C).
 * Les slugs doivent correspondre aux plans configurés dans le Clerk Dashboard.
 *
 * En dev / early access : QUOTAS_ENABLED=false → aucune limite appliquée.
 */
export const QUOTAS_ENABLED = false;

export const PLAN_LIMITS = {
  solo: {
    maxStudios: Number.MAX_SAFE_INTEGER,
    maxVideosPerMonth: Number.MAX_SAFE_INTEGER,
  },
  studio: {
    maxStudios: Number.MAX_SAFE_INTEGER,
    maxVideosPerMonth: Number.MAX_SAFE_INTEGER,
  },
  agence: {
    maxStudios: Number.MAX_SAFE_INTEGER,
    maxVideosPerMonth: Number.MAX_SAFE_INTEGER,
  },
} as const;

export type PlanSlug = keyof typeof PLAN_LIMITS;

export function isPlanSlug(value: string): value is PlanSlug {
  return value in PLAN_LIMITS;
}

/** Mois courant au format YYYY-MM (UTC). */
export function currentMonthKey(now = Date.now()): string {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

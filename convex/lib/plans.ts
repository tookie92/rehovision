/**
 * Quotas par plan Clerk Billing (B2C).
 * Les slugs doivent correspondre aux plans configurés dans le Clerk Dashboard.
 *
 * Tant que le Billing n'est pas branché, le défaut `solo` reste permissif
 * pour le développement (évite de bloquer à 1 Studio).
 */
export const PLAN_LIMITS = {
  solo: {
    maxStudios: 10,
    maxVideosPerMonth: 50,
  },
  studio: {
    maxStudios: 5,
    maxVideosPerMonth: 30,
  },
  agence: {
    maxStudios: 25,
    maxVideosPerMonth: 150,
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

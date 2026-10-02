/**
 * Réécrit les URLs worker `…/media/{uuid}` en proxy Next same-origin.
 * Évite mixed content (HTTPS app → HTTP :8787) et CORS edge-cases.
 */
const MEDIA_UUID =
  /(?:^|\/)media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\b|$)/i;

export function playbackUrl(
  sourceUrl: string | null | undefined,
  fragment?: string,
): string {
  if (!sourceUrl) return "";
  const m = sourceUrl.match(MEDIA_UUID);
  const base = m ? `/api/worker-media/${m[1]}` : sourceUrl;
  if (!fragment) return base;
  const hash = fragment.startsWith("#") ? fragment : `#${fragment}`;
  return `${base}${hash}`;
}

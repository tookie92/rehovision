import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Infos + secret pour upload direct navigateur → worker :8787.
 * Contourne Cloudflare 413 (~100 Mo) et le proxy Next qui bufferise tout.
 * Usage perso / LAN : le secret part dans le navigateur (onglet Network).
 */
export async function GET() {
  const base = (process.env.WORKER_UPLOAD_URL || "").replace(/\/$/, "");
  const secret = process.env.WORKER_SECRET_KEY || "";
  if (!base || !secret) {
    return NextResponse.json(
      {
        error:
          "WORKER_UPLOAD_URL / WORKER_SECRET_KEY manquants dans .env.local",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    uploadUrl: `${base}/upload`,
    mediaBase: base,
    secret,
  });
}

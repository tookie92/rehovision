import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gros vlogs — nécessite Node (pas Edge). */
export const maxDuration = 600;

/**
 * Proxy upload → worker disque local (secret côté serveur).
 * Body = fichier brut ; header optionnel x-filename.
 */
export async function POST(req: NextRequest) {
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

  const filename = req.headers.get("x-filename") || "upload.mp4";
  const contentType = req.headers.get("content-type") || "video/mp4";
  if (!req.body) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${base}/upload`, {
      method: "POST",
      headers: {
        "x-worker-secret": secret,
        "x-filename": filename,
        "Content-Type": contentType,
      },
      // @ts-expect-error Node fetch duplex for streaming body
      duplex: "half",
      body: req.body,
    });

    const text = await upstream.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text.slice(0, 400) };
    }
    return NextResponse.json(json, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Proxy upload worker échoué",
      },
      { status: 502 },
    );
  }
}

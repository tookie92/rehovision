import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gros vlogs — nécessite Node (pas Edge). */
export const maxDuration = 600;

/**
 * Proxy upload → worker disque local (secret côté serveur).
 * Buffer + Content-Length explicite : le serveur Python refuse souvent
 * les corps chunked sans Content-Length (400 empty body).
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

  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "empty body" }, { status: 400 });
    }

    const upstream = await fetch(`${base}/upload`, {
      method: "POST",
      headers: {
        "x-worker-secret": secret,
        "x-filename": filename,
        "Content-Type": contentType,
        "Content-Length": String(buf.byteLength),
      },
      body: buf,
    });

    const text = await upstream.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text.slice(0, 400) || `HTTP ${upstream.status}` };
    }
    return NextResponse.json(json, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Proxy upload worker échoué — worker joignable ? UPLOAD_HTTP_PORT ?",
      },
      { status: 502 },
    );
  }
}

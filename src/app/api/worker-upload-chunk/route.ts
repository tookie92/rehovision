import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const CHUNK_PATHS = new Set([
  "/upload/init",
  "/upload/chunk",
  "/upload/complete",
  "/upload",
]);

/**
 * Proxy chunked upload → worker (chaque requête < ~32 Mo → sous limite Cloudflare).
 * Query: ?path=/upload/init|/upload/chunk|/upload/complete|/upload
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

  const workerPath = req.nextUrl.searchParams.get("path") || "/upload";
  if (!CHUNK_PATHS.has(workerPath)) {
    return NextResponse.json({ error: "path invalide" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await req.arrayBuffer());
    const headers: Record<string, string> = {
      "x-worker-secret": secret,
    };
    for (const h of [
      "x-filename",
      "x-file-id",
      "x-chunk-index",
      "x-chunk-total",
      "content-type",
    ]) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    if (buf.byteLength > 0) {
      headers["Content-Length"] = String(buf.byteLength);
    } else if (workerPath === "/upload/init" || workerPath === "/upload/complete") {
      headers["Content-Length"] = "0";
    }

    const upstream = await fetch(`${base}${workerPath}`, {
      method: "POST",
      headers,
      body: buf.byteLength > 0 ? buf : undefined,
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
            : "Proxy upload chunk échoué",
      },
      { status: 502 },
    );
  }
}

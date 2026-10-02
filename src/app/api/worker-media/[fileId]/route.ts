import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Proxy stream /media/{id} → worker (same-origin).
 * Contourne mixed content HTTPS→HTTP et passe les Range pour le seek vidéo.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await ctx.params;
  if (!UUID_RE.test(fileId)) {
    return NextResponse.json({ error: "fileId invalide" }, { status: 400 });
  }

  const base = (process.env.WORKER_UPLOAD_URL || "").replace(/\/$/, "");
  if (!base) {
    return NextResponse.json(
      { error: "WORKER_UPLOAD_URL manquant" },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(`${base}/media/${fileId}`, {
      headers,
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: text.slice(0, 200) || `HTTP ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const out = new Headers();
    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ]) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Cache-Control", "private, max-age=3600");
    out.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Proxy media échoué",
      },
      { status: 502 },
    );
  }
}

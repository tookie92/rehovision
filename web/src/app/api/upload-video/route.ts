import { createWriteStream } from "fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

export const runtime = "nodejs";
export const maxDuration = 600;

const TMP_ROOT = "/tmp/rehovision-uploads";
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 Gio
const CHUNK_THRESHOLD_NOTE =
  "Fichiers >80 Mo : upload par chunks via cette API (bypass limite ~100 Mo Cloudflare).";

function localConvexUrl(): string {
  return (
    process.env.CONVEX_SELF_HOSTED_URL ||
    process.env.CONVEX_URL ||
    "http://127.0.0.1:3210"
  ).replace(/\/$/, "");
}

/** Réécrit l’URL d’upload publique vers le backend local (bypass Cloudflare). */
function toLocalUploadUrl(uploadUrl: string): string {
  try {
    const local = new URL(localConvexUrl());
    const pub = new URL(uploadUrl);
    pub.protocol = local.protocol;
    pub.host = local.host;
    return pub.toString();
  } catch {
    return uploadUrl;
  }
}

function safeUploadId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) {
    throw new Error("uploadId invalide");
  }
  return id;
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

/**
 * Upload vidéo chunké → assemble local → push Convex via 127.0.0.1.
 *
 * Headers:
 *   x-session-id, x-upload-id, x-chunk-index, x-chunk-total,
 *   x-filename, x-content-type, x-total-bytes (optionnel)
 * Body: binaire du chunk
 */
export async function POST(req: NextRequest) {
  try {
    const sessionId = (req.headers.get("x-session-id") || "").trim();
    if (sessionId.length < 8) {
      return NextResponse.json({ error: "sessionId invalide" }, { status: 400 });
    }

    const uploadId = safeUploadId(
      (req.headers.get("x-upload-id") || "").trim(),
    );
    const chunkIndex = Number(req.headers.get("x-chunk-index") ?? "NaN");
    const chunkTotal = Number(req.headers.get("x-chunk-total") ?? "NaN");
    if (
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(chunkTotal) ||
      chunkIndex < 0 ||
      chunkTotal < 1 ||
      chunkIndex >= chunkTotal
    ) {
      return NextResponse.json(
        { error: "index/total de chunk invalides" },
        { status: 400 },
      );
    }

    const filename = (req.headers.get("x-filename") || "video.mp4").replace(
      /[^\w.\- ()[\]]+/g,
      "_",
    );
    const contentType =
      req.headers.get("x-content-type") || "application/octet-stream";
    const totalBytesHeader = req.headers.get("x-total-bytes");
    if (totalBytesHeader) {
      const totalBytes = Number(totalBytesHeader);
      if (Number.isFinite(totalBytes) && totalBytes > MAX_BYTES) {
        return NextResponse.json(
          { error: `Fichier trop grand (max ${MAX_BYTES / (1024 * 1024)} Mo)` },
          { status: 413 },
        );
      }
    }

    const dir = path.join(TMP_ROOT, uploadId);
    await ensureDir(dir);
    const chunkPath = path.join(dir, `part_${chunkIndex.toString().padStart(5, "0")}`);

    const body = req.body;
    if (!body) {
      return NextResponse.json({ error: "Body vide" }, { status: 400 });
    }

    const nodeReadable = Readable.fromWeb(
      body as import("stream/web").ReadableStream,
    );
    await pipeline(nodeReadable, createWriteStream(chunkPath));

    const chunkStat = await stat(chunkPath);
    if (chunkStat.size <= 0) {
      return NextResponse.json({ error: "Chunk vide" }, { status: 400 });
    }

    // Pas encore le dernier chunk
    if (chunkIndex < chunkTotal - 1) {
      return NextResponse.json({
        ok: true,
        received: chunkIndex + 1,
        total: chunkTotal,
        note: CHUNK_THRESHOLD_NOTE,
      });
    }

    // Dernier chunk : vérifier que toutes les parts sont là, concat, upload Convex
    for (let i = 0; i < chunkTotal; i++) {
      const p = path.join(dir, `part_${i.toString().padStart(5, "0")}`);
      try {
        await stat(p);
      } catch {
        return NextResponse.json(
          { error: `Chunk manquant: ${i}/${chunkTotal}` },
          { status: 400 },
        );
      }
    }

    const assembled = path.join(dir, `assembled_${filename}`);
    const out = await open(assembled, "w");
    try {
      let assembledSize = 0;
      for (let i = 0; i < chunkTotal; i++) {
        const p = path.join(dir, `part_${i.toString().padStart(5, "0")}`);
        const buf = await readFile(p);
        assembledSize += buf.length;
        if (assembledSize > MAX_BYTES) {
          await out.close();
          await rm(dir, { recursive: true, force: true });
          return NextResponse.json(
            { error: `Fichier trop grand (max ${MAX_BYTES / (1024 * 1024)} Mo)` },
            { status: 413 },
          );
        }
        await out.write(buf);
      }
    } finally {
      await out.close();
    }

    const convexUrl = localConvexUrl();
    const client = new ConvexHttpClient(convexUrl);
    const uploadUrlRaw = await client.mutation(api.jobs.generateUploadUrl, {
      sessionId,
    });
    const uploadUrl = toLocalUploadUrl(String(uploadUrlRaw));

    const fileBuf = await readFile(assembled);
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: fileBuf,
    });
    if (!up.ok) {
      const t = await up.text().catch(() => "");
      await rm(dir, { recursive: true, force: true });
      return NextResponse.json(
        {
          error: `Upload Convex échoué (${up.status})`,
          detail: t.slice(0, 200),
        },
        { status: 502 },
      );
    }
    const upBody = (await up.json()) as { storageId?: string };
    if (!upBody.storageId) {
      await rm(dir, { recursive: true, force: true });
      return NextResponse.json(
        { error: "Convex sans storageId" },
        { status: 502 },
      );
    }

    // meta + cleanup
    await writeFile(
      path.join(dir, "done.json"),
      JSON.stringify({ storageId: upBody.storageId, bytes: fileBuf.length }),
    );
    await rm(dir, { recursive: true, force: true });

    return NextResponse.json({
      ok: true,
      storageId: upBody.storageId,
      bytes: fileBuf.length,
      received: chunkTotal,
      total: chunkTotal,
    });
  } catch (err) {
    console.error("upload-video", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Échec upload",
      },
      { status: 500 },
    );
  }
}

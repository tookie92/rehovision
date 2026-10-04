import { NextRequest, NextResponse } from "next/server";

function normalizeLang(code: string): string {
  return code.trim().toLowerCase().split("-")[0] ?? "";
}

/** Proxy aperçu TTS OmniVoice (Voice Lab / clone) → worker :8788/preview-voice */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      targetLang?: string;
      sourceLang?: string;
      instruct?: string;
      speed?: number;
      refAudioBase64?: string;
      refMime?: string;
    };
    const targetLang = normalizeLang(body.targetLang ?? "fr");
    const sourceLang = normalizeLang(body.sourceLang ?? "fr");
    const instruct = (body.instruct ?? "").trim();
    const refAudioBase64 = (body.refAudioBase64 ?? "").trim();
    if (!targetLang) {
      return NextResponse.json(
        { error: "Langue cible requise." },
        { status: 400 },
      );
    }
    // Auto (sans instruct ni ref), Voice Lab, ou clone — tous OK

    const base = (
      process.env.WORKER_TRANSLATE_URL ?? "http://127.0.0.1:8788"
    ).replace(/\/$/, "");
    const res = await fetch(`${base}/preview-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: (body.text ?? "").trim() || undefined,
        targetLang,
        sourceLang,
        instruct: instruct || undefined,
        speed: body.speed,
        refAudioBase64: refAudioBase64 || undefined,
        refMime: body.refMime,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const data = (await res.json()) as {
      audioBase64?: string;
      mimeType?: string;
      text?: string;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Aperçu voix échoué (${res.status})` },
        { status: res.status === 429 ? 429 : res.status === 422 ? 422 : 503 },
      );
    }
    if (!data.audioBase64) {
      return NextResponse.json(
        { error: "Aperçu audio vide — réessaie." },
        { status: 422 },
      );
    }
    return NextResponse.json({
      audioBase64: data.audioBase64,
      mimeType: data.mimeType ?? "audio/wav",
      text: data.text,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Échec aperçu voix";
    const status = /fetch failed|ECONNREFUSED|AbortError|timeout/i.test(message)
      ? 503
      : 422;
    return NextResponse.json(
      {
        error:
          status === 503
            ? `Worker injoignable (${message}). Vérifie rehovision-worker / port 8788.`
            : message,
      },
      { status },
    );
  }
}

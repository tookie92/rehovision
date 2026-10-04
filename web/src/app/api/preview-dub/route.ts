import { NextRequest, NextResponse } from "next/server";

function normalizeLang(code: string): string {
  return code.trim().toLowerCase().split("-")[0] ?? "";
}

/** Proxy vers worker NLLB (TRANSLATE_PORT) — plus d’Ollama pour le dub. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      text?: string;
      sourceLang?: string;
      targetLang?: string;
    };
    const sourceText = (body.text ?? "").trim();
    const sourceLang = normalizeLang(body.sourceLang ?? "fr");
    const targetLang = normalizeLang(body.targetLang ?? "fr");
    if (!sourceText) {
      return NextResponse.json(
        { error: "Texte source requis pour l’aperçu." },
        { status: 400 },
      );
    }
    if (!sourceLang || !targetLang) {
      return NextResponse.json(
        { error: "Langues source et cible requises." },
        { status: 400 },
      );
    }

    const base = (
      process.env.WORKER_TRANSLATE_URL ?? "http://127.0.0.1:8788"
    ).replace(/\/$/, "");
    const res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: sourceText,
        sourceLang,
        targetLang,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const data = (await res.json()) as {
      spokenText?: string;
      sourceText?: string;
      sourceLang?: string;
      targetLang?: string;
      translated?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Traduction échouée (${res.status})` },
        { status: res.status === 422 ? 422 : 503 },
      );
    }
    if (!data.spokenText?.trim()) {
      return NextResponse.json(
        { error: "Aperçu vide — réessaie." },
        { status: 422 },
      );
    }
    return NextResponse.json({
      sourceText: data.sourceText ?? sourceText,
      spokenText: data.spokenText.trim(),
      sourceLang: data.sourceLang ?? sourceLang,
      targetLang: data.targetLang ?? targetLang,
      translated: data.translated ?? sourceLang !== targetLang,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Échec préparation traduction";
    const status = /fetch failed|ECONNREFUSED|AbortError|timeout/i.test(message)
      ? 503
      : 422;
    return NextResponse.json(
      {
        error:
          status === 503
            ? `Worker NLLB injoignable (${message}). Vérifie rehovision-worker / port 8788.`
            : message,
      },
      { status },
    );
  }
}

/**
 * Partage native (Web Share) ou fallback presse-papiers.
 * Pas de deep-link app TikTok/IG — juste URL MP4 prête à poster.
 */

export type ShareMediaResult =
  | { ok: true; mode: "share" | "clipboard" }
  | { ok: false; reason: string };

export async function shareOrCopyMedia(opts: {
  url: string;
  title: string;
  text?: string;
}): Promise<ShareMediaResult> {
  const { url, title, text } = opts;
  if (!url) return { ok: false, reason: "Pas d’URL à partager" };

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      let file: File | undefined;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const name = title.replace(/[^\w\-]+/g, "_").slice(0, 48) || "clip";
          file = new File([blob], `${name}.mp4`, {
            type: blob.type || "video/mp4",
          });
        }
      } catch {
        file = undefined;
      }

      const canFiles =
        file &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canFiles && file) {
        await navigator.share({
          title,
          text: text ?? title,
          files: [file],
        });
        return { ok: true, mode: "share" };
      }

      await navigator.share({
        title,
        text: text ?? title,
        url,
      });
      return { ok: true, mode: "share" };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, reason: "Annulé" };
      }
      // fallback clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, mode: "clipboard" };
  } catch {
    return { ok: false, reason: "Partage indisponible" };
  }
}

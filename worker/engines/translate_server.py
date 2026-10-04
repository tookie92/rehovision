"""HTTP local : aperçu trad NLLB + aperçu voix OmniVoice (Next → worker)."""
from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger("engines.translate_server")

_server: ThreadingHTTPServer | None = None
_thread: threading.Thread | None = None
_voice_lock = threading.Lock()

_PREVIEW_TEXTS = {
    "fr": "Bonjour, voici un aperçu de ma voix.",
    "en": "Hello, this is a short preview of my voice.",
    "wo": "Na nga def. Lii mooy sampleu sama baat.",
    "wof": "Na nga def. Lii mooy sampleu sama baat.",
    "sn": "Mhoroi. Iyi ndiyo sample yezwi rangu.",
    "sw": "Habari. Hii ni sampuli fupi ya sauti yangu.",
}


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        log.info("%s - " + fmt, self.address_string(), *args)

    def _json(self, code: int, body: dict[str, Any]) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/health", "/"):
            self._json(200, {"ok": True, "service": "rehovision-preview"})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "JSON invalide"})
            return

        if path in ("/translate", "/preview-dub"):
            self._handle_translate(body)
            return
        if path == "/preview-voice":
            self._handle_preview_voice(body)
            return
        self._json(404, {"error": "not found"})

    def _handle_translate(self, body: dict[str, Any]) -> None:
        text = (body.get("text") or "").strip()
        source_lang = body.get("sourceLang") or body.get("source_lang") or "fr"
        target_lang = body.get("targetLang") or body.get("target_lang") or "en"
        if not text:
            self._json(400, {"error": "Texte source requis pour l’aperçu."})
            return

        try:
            from engines.translate import translate

            spoken = translate(text, str(source_lang), str(target_lang))
            self._json(
                200,
                {
                    "sourceText": text,
                    "spokenText": spoken,
                    "sourceLang": str(source_lang).split("-")[0].lower(),
                    "targetLang": str(target_lang).split("-")[0].lower(),
                    "translated": spoken.strip() != text.strip(),
                },
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("translate failed")
            self._json(422, {"error": str(exc)[:500]})

    def _handle_preview_voice(self, body: dict[str, Any]) -> None:
        target_lang = str(
            body.get("targetLang") or body.get("target_lang") or "fr"
        ).split("-")[0].lower()
        instruct = (body.get("instruct") or "").strip() or None
        text = (body.get("text") or "").strip()
        if not text:
            text = _PREVIEW_TEXTS.get(target_lang) or _PREVIEW_TEXTS["fr"]

        speed_raw = body.get("speed")
        speed: float | None = None
        if speed_raw is not None and str(speed_raw).strip() != "":
            try:
                speed = float(speed_raw)
            except (TypeError, ValueError):
                self._json(400, {"error": "speed invalide"})
                return

        ref_b64 = (body.get("refAudioBase64") or "").strip()
        # instruct / clone / auto (aucun des deux) tous autorisés

        # Évite deux OmniVoice en parallèle sur le même GPU
        if not _voice_lock.acquire(blocking=False):
            self._json(
                429,
                {"error": "Aperçu voix déjà en cours — réessaie dans un instant."},
            )
            return

        tmp_paths: list[Path] = []
        try:
            from engines.voice import generate_voice, prepare_clone_ref

            ref_path = None
            ref_text = None
            if ref_b64:
                raw_audio = base64.b64decode(ref_b64, validate=False)
                if len(raw_audio) > 8_000_000:
                    self._json(400, {"error": "Échantillon trop lourd (max ~8 Mo)"})
                    return
                suffix = ".wav"
                mime = str(body.get("refMime") or "").lower()
                if "mpeg" in mime or "mp3" in mime:
                    suffix = ".mp3"
                elif "m4a" in mime or "mp4" in mime:
                    suffix = ".m4a"
                elif "ogg" in mime:
                    suffix = ".ogg"
                elif "webm" in mime:
                    suffix = ".webm"
                fd, tmp_name = tempfile.mkstemp(
                    prefix="preview_ref_", suffix=suffix
                )
                os.close(fd)
                tmp = Path(tmp_name)
                tmp.write_bytes(raw_audio)
                tmp_paths.append(tmp)
                ref_path, ref_text = prepare_clone_ref(
                    tmp,
                    source_lang=body.get("sourceLang")
                    or body.get("source_lang")
                    or target_lang,
                )
                if ref_path:
                    tmp_paths.append(Path(ref_path))

            out = generate_voice(
                text=text,
                source_lang=str(
                    body.get("sourceLang") or body.get("source_lang") or "fr"
                ),
                target_lang=target_lang,
                instruct=None if ref_path else instruct,
                ref_audio=ref_path,
                ref_text=ref_text,
                speed=speed,
            )
            wav_bytes = Path(out).read_bytes()
            tmp_paths.append(Path(out))
            self._json(
                200,
                {
                    "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
                    "mimeType": "audio/wav",
                    "text": text,
                    "targetLang": target_lang,
                    "instruct": instruct,
                    "clone": bool(ref_path),
                    "bytes": len(wav_bytes),
                },
            )
        except Exception as exc:  # noqa: BLE001
            log.exception("preview-voice failed")
            self._json(422, {"error": str(exc)[:500]})
        finally:
            _voice_lock.release()
            for p in tmp_paths:
                try:
                    p.unlink(missing_ok=True)
                except OSError:
                    pass


def start_translate_server() -> None:
    """Démarre le serveur en thread daemon (no-op si déjà lancé)."""
    global _server, _thread
    if _thread is not None and _thread.is_alive():
        return
    port = int(os.environ.get("TRANSLATE_PORT", "8788"))
    host = os.environ.get("TRANSLATE_HOST", "127.0.0.1")
    _server = ThreadingHTTPServer((host, port), _Handler)
    _thread = threading.Thread(
        target=_server.serve_forever,
        name="nllb-translate-http",
        daemon=True,
    )
    _thread.start()
    log.info("NLLB translate HTTP sur http://%s:%d", host, port)

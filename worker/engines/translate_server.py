"""HTTP local pour aperçu trad (Next → worker NLLB)."""
from __future__ import annotations

import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger("engines.translate_server")

_server: ThreadingHTTPServer | None = None
_thread: threading.Thread | None = None


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
            self._json(200, {"ok": True, "service": "nllb-translate"})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in ("/translate", "/preview-dub"):
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "JSON invalide"})
            return

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

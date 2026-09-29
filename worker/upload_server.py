"""
Serveur HTTP léger : upload gros fichiers → disque worker (évite Convex 2 min timeout).

Endpoints:
  POST /upload          header x-worker-secret, body = fichier brut
                        → { fileId, filename, sizeBytes, mediaUrl }
  GET  /media/<fileId>  stream le fichier (preview navigateur + jobs)

Env:
  UPLOAD_HTTP_PORT=8787          # 0 / vide = désactivé
  UPLOAD_HTTP_HOST=0.0.0.0
  LOCAL_MEDIA_DIR=./data/media
  WORKER_PUBLIC_URL=http://IP:8787   # URL joignable depuis le navigateur
  WORKER_SECRET_KEY=...
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import shutil
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger("rehovision-worker.upload")

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)


def media_root() -> Path:
    raw = os.getenv("LOCAL_MEDIA_DIR", "./data/media")
    root = Path(raw).expanduser()
    if not root.is_absolute():
        root = Path(__file__).resolve().parent / root
    (root / "uploads").mkdir(parents=True, exist_ok=True)
    return root


_MEDIA_EXTS = {
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
    ".m4v",
    ".avi",
    ".mp3",
    ".wav",
    ".m4a",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}


def resolve_local_file(file_id: str) -> Path | None:
    """
    Résout l'upload média. Ignore le sidecar {fileId}.json (méta ~quelques centaines d'octets)
    — sinon Whisper reçoit le JSON et échoue « trop petit (341 o) ».
    """
    if not _UUID_RE.match(file_id):
        return None
    uploads = media_root() / "uploads"
    candidates = [
        p
        for p in uploads.glob(f"{file_id}.*")
        if p.is_file() and p.suffix.lower() in _MEDIA_EXTS
    ]
    if candidates:
        # Préférer mp4 si plusieurs
        candidates.sort(key=lambda p: (0 if p.suffix.lower() == ".mp4" else 1, p.name))
        return candidates[0]
    # sans extension
    bare = uploads / file_id
    return bare if bare.is_file() else None


def store_result_file(src: Path, *, preferred_ext: str | None = None) -> str:
    """
    Copie un résultat de rendu sur le disque worker et retourne l’URL publique /media/.
    Évite d’envoyer le MP4 dans l’httpAction Convex (limite ~64 Mo RAM).
    """
    if not src.is_file() or src.stat().st_size == 0:
        raise RuntimeError(f"Résultat vide: {src}")
    ext = (preferred_ext or src.suffix or ".mp4").lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext not in _MEDIA_EXTS:
        ext = ".mp4"
    file_id = str(uuid.uuid4())
    dest = media_root() / "uploads" / f"{file_id}{ext}"
    shutil.copy2(src, dest)
    base = public_base_url()
    if not base:
        raise RuntimeError(
            "WORKER_PUBLIC_URL manquant — requis pour servir les clips rendus "
            "(évite OOM Convex submitJobResult)"
        )
    media_url = f"{base}/media/{file_id}"
    meta = {
        "fileId": file_id,
        "filename": src.name,
        "sizeBytes": dest.stat().st_size,
        "mediaUrl": media_url,
        "kind": "render_result",
    }
    (media_root() / "uploads" / f"{file_id}.json").write_text(
        json.dumps(meta),
        encoding="utf-8",
    )
    log.info(
        "Résultat stocké local %s (%.1f Mo) → %s",
        file_id,
        dest.stat().st_size / 1e6,
        media_url,
    )
    return media_url


def store_source_file(
    src: Path,
    *,
    stable_key: str,
    preferred_ext: str | None = None,
) -> tuple[str, str]:
    """
    Persiste une source (ex. YouTube) sous un fileId stable (uuid5)
    pour soft preview + réutilisation entre jobs (pas N copies).
    Retourne (media_url, file_id).
    """
    if not src.is_file() or src.stat().st_size == 0:
        raise RuntimeError(f"Source vide: {src}")
    ext = (preferred_ext or src.suffix or ".mp4").lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext not in _MEDIA_EXTS:
        ext = ".mp4"
    file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, stable_key.strip()))
    dest = media_root() / "uploads" / f"{file_id}{ext}"
    base = public_base_url()
    if not base:
        raise RuntimeError(
            "WORKER_PUBLIC_URL manquant — requis pour soft preview YouTube"
        )
    if not dest.is_file() or dest.stat().st_size == 0:
        shutil.copy2(src, dest)
    media_url = f"{base}/media/{file_id}"
    meta = {
        "fileId": file_id,
        "filename": src.name,
        "sizeBytes": dest.stat().st_size,
        "mediaUrl": media_url,
        "kind": "source_media",
        "stableKey": stable_key[:200],
    }
    (media_root() / "uploads" / f"{file_id}.json").write_text(
        json.dumps(meta),
        encoding="utf-8",
    )
    log.info(
        "Source stockée %s (%.1f Mo) → %s",
        file_id,
        dest.stat().st_size / 1e6,
        media_url,
    )
    return media_url, file_id


def public_base_url() -> str:
    return (os.getenv("WORKER_PUBLIC_URL") or "").rstrip("/")


class UploadHandler(BaseHTTPRequestHandler):
    server_version = "RehoUpload/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        log.info("%s - %s", self.address_string(), fmt % args)

    def _secret_ok(self) -> bool:
        expected = (os.getenv("WORKER_SECRET_KEY") or "").strip()
        if not expected:
            return False
        got = (self.headers.get("x-worker-secret") or "").strip()
        return got == expected

    def _send_json(self, code: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "x-worker-secret, content-type, x-filename")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "x-worker-secret, content-type, x-filename")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/upload":
            self._send_json(404, {"error": "not found"})
            return
        if not self._secret_ok():
            self._send_json(401, {"error": "unauthorized"})
            return

        length_hdr = (self.headers.get("Content-Length") or "").strip()
        length = int(length_hdr) if length_hdr.isdigit() else -1
        # ~2 Go soft limit
        if length > 2 * 1024 * 1024 * 1024:
            self._send_json(413, {"error": "file too large (max 2GB)"})
            return

        filename = (self.headers.get("x-filename") or "upload.mp4").strip()
        filename = Path(filename).name or "upload.mp4"
        ext = Path(filename).suffix.lower() or ".mp4"
        if ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi", ".mp3", ".wav", ".m4a"}:
            ext = ".mp4"

        file_id = str(uuid.uuid4())
        dest = media_root() / "uploads" / f"{file_id}{ext}"

        try:
            with dest.open("wb") as f:
                if length > 0:
                    remaining = length
                    while remaining > 0:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)
                    if remaining > 0:
                        dest.unlink(missing_ok=True)
                        self._send_json(
                            400,
                            {
                                "error": (
                                    f"upload tronqué ({length - remaining}/{length} o) "
                                    "— connexion coupée avant la fin (moov manquant sinon)"
                                ),
                            },
                        )
                        return
                else:
                    # Chunked / pas de Content-Length (proxy Next) — lire jusqu'à EOF
                    # Limite soft 2 Go
                    written = 0
                    max_bytes = 2 * 1024 * 1024 * 1024
                    while written < max_bytes:
                        chunk = self.rfile.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        written += len(chunk)
                    if written >= max_bytes:
                        dest.unlink(missing_ok=True)
                        self._send_json(413, {"error": "file too large (max 2GB)"})
                        return
        except Exception as e:
            dest.unlink(missing_ok=True)
            log.exception("Write upload failed")
            self._send_json(500, {"error": f"write failed: {e}"})
            return

        if not dest.is_file() or dest.stat().st_size == 0:
            dest.unlink(missing_ok=True)
            self._send_json(
                400,
                {
                    "error": "empty body (Content-Length manquant ou flux vide)",
                },
            )
            return

        # Détecter MP4 tronqué avant d'accepter (évite Whisper « moov atom not found »)
        try:
            from generators.media_validate import assert_readable_media

            assert_readable_media(dest, label="upload")
        except RuntimeError as e:
            dest.unlink(missing_ok=True)
            self._send_json(400, {"error": str(e)})
            return
        except Exception as e:
            log.warning("ffprobe upload skip (%s) — fichier accepté sans check", e)

        base = public_base_url()
        media_url = f"{base}/media/{file_id}" if base else f"/media/{file_id}"
        meta = {
            "fileId": file_id,
            "filename": filename,
            "sizeBytes": dest.stat().st_size,
            "mediaUrl": media_url,
            "localPath": str(dest),
        }
        (media_root() / "uploads" / f"{file_id}.json").write_text(
            json.dumps(meta),
            encoding="utf-8",
        )
        log.info("Upload OK %s (%s Mo)", file_id, dest.stat().st_size // (1024 * 1024))
        self._send_json(200, meta)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/health", "/"):
            self._send_json(200, {"ok": True, "service": "upload"})
            return

        m = re.match(r"^/media/([0-9a-fA-F-]{36})$", path)
        if not m:
            self._send_json(404, {"error": "not found"})
            return

        file_path = resolve_local_file(m.group(1))
        if not file_path:
            self._send_json(404, {"error": "file missing"})
            return

        ctype = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        size = file_path.stat().st_size
        range_hdr = self.headers.get("Range")

        if range_hdr and range_hdr.startswith("bytes="):
            # Support seek vidéo navigateur
            try:
                spec = range_hdr.replace("bytes=", "").split("-")
                start = int(spec[0]) if spec[0] else 0
                end = int(spec[1]) if len(spec) > 1 and spec[1] else size - 1
                end = min(end, size - 1)
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(length))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with file_path.open("rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                return
            except Exception as e:
                log.warning("Range KO: %s", e)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        with file_path.open("rb") as f:
            shutil_copyfileobj(f, self.wfile)


def shutil_copyfileobj(fsrc, fdst, length: int = 1024 * 1024) -> None:
    while True:
        buf = fsrc.read(length)
        if not buf:
            break
        fdst.write(buf)


def start_upload_server() -> threading.Thread | None:
    port_raw = (os.getenv("UPLOAD_HTTP_PORT") or "").strip()
    if not port_raw or port_raw in ("0", "false", "off"):
        log.info("Upload HTTP désactivé (UPLOAD_HTTP_PORT)")
        return None
    port = int(port_raw)
    host = os.getenv("UPLOAD_HTTP_HOST", "0.0.0.0")
    media_root()
    httpd = ThreadingHTTPServer((host, port), UploadHandler)
    t = threading.Thread(target=httpd.serve_forever, name="upload-http", daemon=True)
    t.start()
    log.info(
        "Upload HTTP sur http://%s:%s (PUBLIC=%s)",
        host,
        port,
        public_base_url() or "(non défini)",
    )
    return t

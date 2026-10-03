#!/usr/bin/env bash
# OmniVoice dans worker/venv_omnivoice (isole Torch — ne casse pas Piper dans .venv).
# Par défaut attend la fin d'ACE-Step. FORCE_NOW=1 pour ignorer l'attente.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/logs/omnivoice-setup.log"
VENV="$ROOT/venv_omnivoice"
ACE_LOG="$ROOT/logs/acestep-download.log"
mkdir -p "$ROOT/logs"

exec >>"$LOG" 2>&1
echo "[$(date -Iseconds)] setup_omnivoice start (venv=$VENV force=${FORCE_NOW:-0})"

if [[ "${FORCE_NOW:-0}" != "1" ]]; then
  if pgrep -f '[a]cestep-download' >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] ACE-Step download en cours — attente…"
    while pgrep -f '[a]cestep-download' >/dev/null 2>&1; do
      sleep 45
    done
    echo "[$(date -Iseconds)] ACE-Step download process ended"
  fi
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -U pip wheel

echo "[$(date -Iseconds)] install torch+torchaudio cu128…"
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128

echo "[$(date -Iseconds)] install omnivoice (deps sauf torch déjà pin)…"
pip install 'accelerate' 'librosa' 'numpy' 'pydub' 'soundfile' \
  'tensorboardX' 'transformers>=5.3.0' 'webdataset' 'huggingface_hub'
pip install 'omnivoice' --no-deps

python - <<'PY'
import os
from pathlib import Path
import torch
from huggingface_hub import snapshot_download

print("torch", torch.__version__, "cuda", torch.cuda.is_available())
print("snapshot_download k2-fsa/OmniVoice…")
path = snapshot_download(repo_id=os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"))
print("cached at", path)
total = sum(p.stat().st_size for p in Path(path).rglob("*.safetensors") if p.is_file())
print(f"safetensors total bytes={total}")
from omnivoice import OmniVoice  # noqa: F401
print("import OmniVoice OK")
print("OMNIVOICE DOWNLOAD DONE")
PY

echo "$VENV/bin/python" > "$ROOT/.omnivoice_python"
echo "[$(date -Iseconds)] setup_omnivoice DONE — OMNIVOICE_PYTHON=$VENV/bin/python"

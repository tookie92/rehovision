#!/usr/bin/env bash
# Démarre le worker dans le venv local (PEP 668 / Ubuntu).
# Important : Python 3.11/3.12 pour les wheels PyTorch CUDA (pas 3.14).
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  if command -v python3.11 >/dev/null; then
    PY=python3.11
  elif command -v python3.12 >/dev/null; then
    PY=python3.12
  else
    echo "Python 3.11 ou 3.12 requis pour PyTorch CUDA (trouvé: $(python3 --version))"
    exit 1
  fi
  "$PY" -m venv .venv
  echo "Venv créé avec $PY."
  echo "Ensuite :"
  echo "  .venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124"
  echo "  .venv/bin/pip install -r requirements.txt"
  echo "Voir README.md"
  exit 1
fi

exec .venv/bin/python main.py

#!/usr/bin/env bash
# Active MUSIC_ENGINE=acestep et redémarre le worker systemd (si possible).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/logs/acestep-download.log"
ACE_VENV="$ROOT/vendor/ACE-Step-1.5/.venv/bin/python"
ENVF="$ROOT/.env"

if [[ ! -x "$ACE_VENV" ]]; then
  echo "ACE-Step venv manquant. Attendre la fin de uv sync."
  exit 1
fi

if [[ -f "$LOG" ]] && ! grep -q 'ALL DOWNLOADS DONE' "$LOG"; then
  echo "Download pas encore terminé. Suivi : tail -f $LOG"
  exit 2
fi

# Checkpoints minimum
CKPT="$ROOT/vendor/ACE-Step-1.5/checkpoints"
if [[ ! -d "$CKPT" ]] || [[ -z "$(ls -A "$CKPT" 2>/dev/null)" ]]; then
  echo "Pas de checkpoints dans $CKPT"
  exit 3
fi

# Worker reste sur .venv (Piper) ; ACE tourne en subprocess via ACESTEP_PYTHON
if grep -q '^MUSIC_ENGINE=' "$ENVF"; then
  sed -i 's/^MUSIC_ENGINE=.*/MUSIC_ENGINE=acestep/' "$ENVF"
else
  echo 'MUSIC_ENGINE=acestep' >> "$ENVF"
fi

ACE_PY="$ROOT/vendor/ACE-Step-1.5/.venv/bin/python"
if grep -q '^ACESTEP_PYTHON=' "$ENVF"; then
  sed -i "s|^ACESTEP_PYTHON=.*|ACESTEP_PYTHON=$ACE_PY|" "$ENVF"
else
  echo "ACESTEP_PYTHON=$ACE_PY" >> "$ENVF"
fi

echo "MUSIC_ENGINE=acestep + ACESTEP_PYTHON=$ACE_PY"
echo "Redémarrer : sudo systemctl restart rehovision-worker"

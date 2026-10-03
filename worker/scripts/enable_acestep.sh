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

# Pointer le service vers le venv ACE-Step (torch + acestep + convex)
if grep -q '^MUSIC_ENGINE=' "$ENVF"; then
  sed -i 's/^MUSIC_ENGINE=.*/MUSIC_ENGINE=acestep/' "$ENVF"
else
  echo 'MUSIC_ENGINE=acestep' >> "$ENVF"
fi

# Remplacer l'interpréteur du worker courant : on lance via ACE venv
# (systemd ExecStart pointe encore sur worker/.venv — on crée un wrapper)
cat > "$ROOT/run_acestep_worker.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$ROOT"
export PATH="$ROOT/vendor/ACE-Step-1.5/.venv/bin:\$PATH"
exec "$ROOT/vendor/ACE-Step-1.5/.venv/bin/python" "$ROOT/main.py"
EOF
chmod +x "$ROOT/run_acestep_worker.sh"

echo "MUSIC_ENGINE=acestep dans $ENVF"
echo "Pour redémarrer le worker :"
echo "  sudo systemctl restart rehovision-worker"
echo "  # ou, si l'unité pointe encore sur .venv :"
echo "  pkill -f 'worker/.venv/bin/python main.py' ; $ROOT/run_acestep_worker.sh &"
echo "Ou mets ExecStart=$ROOT/run_acestep_worker.sh dans /etc/systemd/system/rehovision-worker.service"

#!/usr/bin/env bash
# Empêche sienna-api (uvicorn) de reprendre la GPU pendant Rehovision.
# Arrêt propre: pkill -f hold_gpu.sh
# Pour un stop systemd durable: sudo systemctl stop sienna-api
set -euo pipefail
LOG="$(cd "$(dirname "$0")/.." && pwd)/logs/gpu-watchdog.log"
mkdir -p "$(dirname "$LOG")"
echo "$(date -Is) hold_gpu started pid=$$" >>"$LOG"
while true; do
  pids=$(pgrep -f "sienna-backend/.venv/bin/uvicorn" || true)
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
    echo "$(date -Is) killed sienna uvicorn: ${pids}" >>"$LOG"
  fi
  sleep 3
done

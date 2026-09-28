#!/usr/bin/env bash
# Télécharge les modèles HF du worker avec retries et reprise.
#
# Usage:
#   ./scripts/download_models.sh status
#   ./scripts/download_models.sh omnivoice
#   ./scripts/download_models.sh flux
#   ./scripts/download_models.sh all
#   ./scripts/download_models.sh all --background
#   ./scripts/download_models.sh cleanup   # déduplique les .incomplete (garde le plus gros)
#
# Variables optionnelles:
#   HF_ATTEMPT_TIMEOUT=0     # 0/off = pas de timeout (recommandé pour Flux)
#                            # sinon durée GNU timeout, ex. 12h
#   HF_MAX_ATTEMPTS=0        # 0 = illimité
#   HF_HUB_DOWNLOAD_TIMEOUT=120
#   HF_HUB_ETAG_TIMEOUT=30
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$WORKER_DIR/logs"
mkdir -p "$LOG_DIR"

HF_BIN="${HF_BIN:-$WORKER_DIR/.venv/bin/hf}"
if [[ ! -x "$HF_BIN" ]]; then
  HF_BIN="$(command -v hf || true)"
fi
if [[ -z "$HF_BIN" ]]; then
  echo "hf introuvable — active le venv: source .venv/bin/activate" >&2
  exit 1
fi

# 0 = illimité : les timeouts 30m créaient des centaines de .incomplete.
HF_ATTEMPT_TIMEOUT="${HF_ATTEMPT_TIMEOUT:-0}"
HF_MAX_ATTEMPTS="${HF_MAX_ATTEMPTS:-0}"
export HF_HUB_DOWNLOAD_TIMEOUT="${HF_HUB_DOWNLOAD_TIMEOUT:-120}"
export HF_HUB_ETAG_TIMEOUT="${HF_HUB_ETAG_TIMEOUT:-30}"
export HF_XET_HIGH_PERFORMANCE="${HF_XET_HIGH_PERFORMANCE:-1}"

declare -A MODEL_IDS=(
  [omnivoice]="k2-fsa/OmniVoice"
  [flux]="black-forest-labs/FLUX.1-schnell"
  [sdxl]="stabilityai/sdxl-turbo"
)

cache_slug() {
  # HF hub layout: models--org--name (each "/" becomes "--")
  # Note: tr '/' '--' is wrong — tr maps 1:1 chars, so "/" → "-" only.
  local repo="$1"
  echo "models--${repo//'/'/--}"
}

cache_dir() {
  local repo="$1"
  echo "${HF_HOME:-$HOME/.cache/huggingface}/hub/$(cache_slug "$repo")"
}

human_du() {
  if [[ ! -d "$1" ]]; then
    echo "absent"
    return 0
  fi
  du -sh "$1" 2>/dev/null | awk '{print $1}' || echo "?"
}

cmd_status() {
  echo "Cache Hugging Face (~/.cache/huggingface/hub)"
  echo
  for key in omnivoice flux sdxl; do
    local repo="${MODEL_IDS[$key]}"
    local dir
    dir="$(cache_dir "$repo")"
    local incomplete=0
    if [[ -d "$dir" ]]; then
      incomplete="$(find "$dir" -name '*.incomplete' 2>/dev/null | wc -l | tr -d ' ')"
    fi
    printf "  %-12s %-40s %8s  (%s fichiers .incomplete)\n" \
      "$key" "$repo" "$(human_du "$dir")" "$incomplete"
  done
  echo
  echo "HF_ATTEMPT_TIMEOUT=${HF_ATTEMPT_TIMEOUT} (0=illimité)"
  echo "Processus:"
  pgrep -af "download_models\.sh" 2>/dev/null | grep -v "pgrep\|status\|cleanup" || echo "  (aucun download_models.sh)"
  pgrep -af "hf download" 2>/dev/null | grep -v "download_models\|pgrep" || echo "  (aucun hf download en cours)"
}

# Keep the largest .incomplete per blob hash; drop zero-byte / smaller siblings.
cleanup_incomplete_dir() {
  local dir="$1"
  local label="${2:-$dir}"
  if [[ ! -d "$dir/blobs" ]]; then
    echo "  $label: pas de blobs/"
    return 0
  fi

  python3 - "$dir" <<'PY'
import os, sys
from collections import defaultdict

blobs = os.path.join(sys.argv[1], "blobs")
groups = defaultdict(list)
for name in os.listdir(blobs):
    if not name.endswith(".incomplete"):
        continue
    path = os.path.join(blobs, name)
    # hash.uuid.incomplete or hash.incomplete
    base = name.split(".", 1)[0]
    try:
        size = os.path.getsize(path)
    except OSError:
        continue
    groups[base].append((size, path))

removed = 0
freed = 0
kept = 0
for base, items in groups.items():
    items.sort(key=lambda x: x[0], reverse=True)
    best_size, best_path = items[0]
    if best_size == 0:
        # all empty — drop all
        for size, path in items:
            os.remove(path)
            removed += 1
            freed += size
        continue
    kept += 1
    for size, path in items[1:]:
        os.remove(path)
        removed += 1
        freed += size

print(f"  kept={kept} removed={removed} freed_bytes={freed}")
PY
}

cmd_cleanup() {
  echo "Déduplication des .incomplete (garde le plus gros par blob)"
  for key in omnivoice flux sdxl; do
    local repo="${MODEL_IDS[$key]}"
    local dir
    dir="$(cache_dir "$repo")"
    echo "→ $key ($(human_du "$dir"))"
    cleanup_incomplete_dir "$dir" "$key"
  done
  echo
  cmd_status
}

run_hf_download() {
  local repo="$1"
  if [[ "$HF_ATTEMPT_TIMEOUT" == "0" || "$HF_ATTEMPT_TIMEOUT" == "off" ]]; then
    "$HF_BIN" download "$repo"
  else
    timeout "$HF_ATTEMPT_TIMEOUT" "$HF_BIN" download "$repo"
  fi
}

download_one() {
  local key="$1"
  local repo="${MODEL_IDS[$key]:-}"
  if [[ -z "$repo" ]]; then
    echo "Modèle inconnu: $key (omnivoice|flux|sdxl)" >&2
    return 1
  fi

  local log="$LOG_DIR/download-${key}.log"
  local attempt=1
  local timeout_label="$HF_ATTEMPT_TIMEOUT"
  if [[ "$HF_ATTEMPT_TIMEOUT" == "0" || "$HF_ATTEMPT_TIMEOUT" == "off" ]]; then
    timeout_label="illimité"
  fi

  echo "→ $key ($repo)"
  echo "  log: $log"
  echo "  timeout/tentative: $timeout_label | http_timeout: ${HF_HUB_DOWNLOAD_TIMEOUT}s"

  while true; do
    echo "[$(date -Is)] tentative $attempt — $(human_du "$(cache_dir "$repo")")" | tee -a "$log"

    set +e
    run_hf_download "$repo" >>"$log" 2>&1
    local code=$?
    set -e

    if [[ $code -eq 0 ]]; then
      echo "✓ $key terminé — $(human_du "$(cache_dir "$repo")")"
      return 0
    fi

    if [[ $code -eq 124 ]]; then
      echo "! timeout après $HF_ATTEMPT_TIMEOUT — reprise au prochain essai" | tee -a "$log"
    else
      echo "! échec (code $code) — reprise au prochain essai" | tee -a "$log"
    fi

    if [[ "$HF_MAX_ATTEMPTS" -gt 0 && "$attempt" -ge "$HF_MAX_ATTEMPTS" ]]; then
      echo "✗ abandon après $attempt tentatives — relance le script plus tard" >&2
      return 1
    fi

    attempt=$((attempt + 1))
    sleep 5
  done
}

cmd_download() {
  local target="${1:-all}"
  shift || true

  case "$target" in
    status)
      cmd_status
      return 0
      ;;
    cleanup)
      cmd_cleanup
      return 0
      ;;
  esac

  if systemctl is-active --quiet rehovision-worker 2>/dev/null; then
    echo "! rehovision-worker actif — risque de lock HF concurrent."
    echo "  Arrête-le d'abord: sudo systemctl stop rehovision-worker"
    echo "  (ou laisse tourner si tu sais qu'il n'utilise pas ce modèle)"
    echo
  fi

  local keys=()
  case "$target" in
    all) keys=(omnivoice flux sdxl) ;;
    omnivoice|flux|sdxl) keys=("$target") ;;
    *)
      echo "Usage: $0 {status|cleanup|omnivoice|flux|sdxl|all} [--background]" >&2
      exit 1
      ;;
  esac

  if [[ "${1:-}" == "--background" ]]; then
    local bg_log="$LOG_DIR/download-${target}-runner.log"
    # Preserve timeout settings in the backgrounded process
    nohup env \
      HF_ATTEMPT_TIMEOUT="$HF_ATTEMPT_TIMEOUT" \
      HF_MAX_ATTEMPTS="$HF_MAX_ATTEMPTS" \
      HF_HUB_DOWNLOAD_TIMEOUT="$HF_HUB_DOWNLOAD_TIMEOUT" \
      HF_HUB_ETAG_TIMEOUT="$HF_HUB_ETAG_TIMEOUT" \
      "$0" "$target" >>"$bg_log" 2>&1 &
    echo "→ lancé en arrière-plan (pid $!) — log $bg_log"
    echo "  HF_ATTEMPT_TIMEOUT=$HF_ATTEMPT_TIMEOUT"
    return 0
  fi

  for key in "${keys[@]}"; do
    download_one "$key"
  done

  echo
  cmd_status
}

cmd_download "${1:-status}" "${@:2}"

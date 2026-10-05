#!/usr/bin/env bash
# Déploiement local Rehovision : git (optionnel) → Convex → build web → systemd.
#
# Usage:
#   ./deploy.sh                         # build + deploy services (pas de commit)
#   ./deploy.sh "message de commit"     # git add/commit/push puis deploy
#   ./deploy.sh --no-push "msg"         # commit local sans push
#   ./deploy.sh --skip-git              # ignore git même avec un message
#   ./deploy.sh --units                 # réinstalle aussi les unités systemd
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DO_PUSH=1
SKIP_GIT=0
INSTALL_UNITS=0
COMMIT_MSG=""

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --no-push) DO_PUSH=0; shift ;;
    --skip-git) SKIP_GIT=1; shift ;;
    --units) INSTALL_UNITS=1; shift ;;
    --) shift; break ;;
    -*)
      echo "Option inconnue: $1" >&2
      exit 1
      ;;
    *)
      COMMIT_MSG="$1"
      shift
      ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }

# --- Git (optionnel) ---
if [[ "$SKIP_GIT" -eq 0 && -n "$COMMIT_MSG" ]]; then
  log "Git: stage + commit"
  git add -A
  # Ne jamais stager les secrets / gros artefacts
  git reset -q -- \
    '.env' '.env.local' 'web/.env.local' 'worker/.env' \
    2>/dev/null || true

  if git diff --cached --quiet; then
    echo "Rien à committer (working tree propre ou seuls fichiers ignorés)."
  else
    git commit -m "$COMMIT_MSG"
    if [[ "$DO_PUSH" -eq 1 ]]; then
      log "Git: push"
      git push -u origin HEAD
    else
      echo "Commit local seulement (--no-push)."
    fi
  fi
elif [[ "$SKIP_GIT" -eq 0 ]]; then
  log "Git: statut (pas de commit — passe un message pour commit+push)"
  git status -sb
fi

# --- Convex ---
log "Convex deploy"
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi
npx convex deploy -y

# --- Web build ---
log "Next.js build (web/)"
npm run build --prefix web

# --- Systemd units (optionnel) ---
if [[ "$INSTALL_UNITS" -eq 1 ]]; then
  log "Installation unités systemd"
  if [[ "$(id -u)" -eq 0 ]]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "sudo requis pour --units" >&2
    exit 1
  fi
  $SUDO cp "$ROOT/deploy/systemd/rehovision-web.service" /etc/systemd/system/
  $SUDO cp "$ROOT/deploy/systemd/rehovision-worker.service" /etc/systemd/system/
  $SUDO cp "$ROOT/deploy/systemd/rehovision-convex.service" /etc/systemd/system/
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable rehovision-convex rehovision-web rehovision-worker
fi

# --- Convex docker (local) ---
log "Convex docker"
if command -v docker >/dev/null 2>&1; then
  docker compose -f "$ROOT/docker-compose.yml" up -d backend dashboard 2>/dev/null || true
fi

# --- Restart services ---
log "Restart systemd (web + worker)"
restart_svc() {
  local unit="$1"
  if systemctl is-enabled "$unit" >/dev/null 2>&1 || systemctl cat "$unit" >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      systemctl restart "$unit"
    elif sudo -n systemctl restart "$unit" 2>/dev/null; then
      :
    elif command -v sudo >/dev/null 2>&1; then
      sudo systemctl restart "$unit"
    else
      # fallback: SIGTERM → Restart=always
      local pid
      pid="$(systemctl show -p MainPID --value "$unit" 2>/dev/null || echo 0)"
      if [[ -n "$pid" && "$pid" != "0" ]]; then
        kill -TERM "$pid" || true
      else
        echo "Impossible de redémarrer $unit (pas de sudo)." >&2
        return 1
      fi
    fi
    echo "  $unit → $(systemctl is-active "$unit" 2>/dev/null || echo '?')"
  else
    echo "  $unit non installé (ignore). Utilise ./deploy.sh --units une fois."
  fi
}

restart_svc rehovision-convex
restart_svc rehovision-web
# laisser le temps au Restart=always si kill
sleep 1
restart_svc rehovision-worker
sleep 2

log "État"
systemctl is-active rehovision-web rehovision-worker 2>/dev/null || true
echo
echo "OK — app: http://127.0.0.1:3000 (ou tunnel app.rehovision.com)"
echo "ACE download: tail -f worker/logs/acestep-download.log"

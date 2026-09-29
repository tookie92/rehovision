#!/usr/bin/env bash
# Rehovision — pull git + build + Convex + services systemd
#
# Usage:
#   ./deploy.sh              # pull, deps, build, convex, restart web+worker
#   ./deploy.sh install      # installe / active les units systemd (sudo)
#   ./deploy.sh restart      # restart web+worker seulement
#   ./deploy.sh status       # état des services + git
#   ./deploy.sh uninstall    # désactive les units (sudo)
#
# Prérequis: .env.local, worker/.env, worker/.venv, Node 20+, cloudflared déjà up.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

USER_NAME="$(whoami)"
UNITS=(rehovision-web rehovision-worker)
TEMPLATE_DIR="$REPO/deploy/systemd"
SYSTEMD_DIR="/etc/systemd/system"

RED=$'\033[31m'
GRN=$'\033[32m'
YLW=$'\033[33m'
DIM=$'\033[2m'
RST=$'\033[0m'

log()  { printf '%s→%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s!%s %s\n' "$YLW" "$RST" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$RST" "$*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Commande manquante: $1"; exit 1; }
}

render_unit() {
  local name="$1"
  local template="$TEMPLATE_DIR/${name}.service.template"
  local dest="$SYSTEMD_DIR/${name}.service"
  [[ -f "$template" ]] || { err "Template introuvable: $template"; exit 1; }
  sed -e "s|{{REPO}}|$REPO|g" -e "s|{{USER}}|$USER_NAME|g" "$template" \
    | sudo tee "$dest" >/dev/null
  log "Installé $dest"
}

cmd_install() {
  need_cmd sudo
  need_cmd systemctl
  [[ -f "$REPO/.env.local" ]] || warn ".env.local absent — Next peut échouer"
  [[ -f "$REPO/worker/.env" ]] || warn "worker/.env absent — worker peut échouer"
  [[ -x "$REPO/worker/.venv/bin/python" ]] || {
    err "worker/.venv manquant. Crée-le avant (voir worker/README.md)."
    exit 1
  }

  for u in "${UNITS[@]}"; do
    render_unit "$u"
  done
  sudo systemctl daemon-reload
  for u in "${UNITS[@]}"; do
    sudo systemctl enable --now "${u}.service"
    log "enable --now ${u}.service"
  done
  warn "Si un 'next dev' tourne encore sur :3000, arrête-le (le service utilise next start)."
  cmd_status
}

cmd_uninstall() {
  need_cmd sudo
  for u in "${UNITS[@]}"; do
    sudo systemctl disable --now "${u}.service" 2>/dev/null || true
    sudo rm -f "$SYSTEMD_DIR/${u}.service"
    log "Retiré ${u}.service"
  done
  sudo systemctl daemon-reload
}

cmd_restart() {
  need_cmd sudo
  for u in "${UNITS[@]}"; do
    if systemctl list-unit-files "${u}.service" 2>/dev/null | grep -q "${u}.service"; then
      sudo systemctl restart "${u}.service"
      log "restart ${u}"
    else
      warn "${u}.service non installé — lance d'abord: ./deploy.sh install"
    fi
  done
}

cmd_status() {
  echo "${DIM}repo${RST}  $REPO"
  echo "${DIM}git${RST}   $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
  echo
  for u in "${UNITS[@]}"; do
    if systemctl cat "${u}.service" &>/dev/null; then
      local state
      state="$(systemctl is-active "${u}.service" 2>/dev/null || true)"
      printf '%s%-22s%s %s\n' "$DIM" "$u" "$RST" "$state"
    else
      printf '%s%-22s%s %s\n' "$DIM" "$u" "$RST" "not-installed"
    fi
  done
  echo
  systemctl --no-pager --full status rehovision-web.service rehovision-worker.service 2>/dev/null \
    | head -40 || true
}

cmd_deploy() {
  need_cmd git
  need_cmd npm
  need_cmd npx

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  log "git fetch + pull ($branch)"
  git fetch origin
  if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
    git pull --ff-only origin "$branch"
  else
    warn "Pas de origin/$branch — skip pull"
  fi

  log "npm ci / install"
  if [[ -f package-lock.json ]]; then
    if ! npm ci; then
      warn "npm ci a échoué (lock désync) — npm install puis retry"
      npm install
    fi
  else
    npm install
  fi

  if grep -qE '^CONVEX_SELF_HOSTED_URL=' .env.local 2>/dev/null && \
     grep -qE '^CONVEX_SELF_HOSTED_ADMIN_KEY=' .env.local 2>/dev/null; then
    log "npm run convex:deploy:self-hosted"
    npm run convex:deploy:self-hosted
  else
    log "npx convex dev --once (Convex Cloud via .env.local)"
    npx convex dev --once
  fi

  log "npm run build"
  npm run build

  if systemctl cat rehovision-web.service &>/dev/null; then
    cmd_restart
  else
    warn "Units systemd absents. Installe-les une fois: ./deploy.sh install"
    warn "Puis relance: ./deploy.sh"
    exit 0
  fi

  log "Déployé."
  cmd_status
}

usage() {
  cat <<'EOF'
Rehovision — pull git + build + Convex + services systemd

Usage:
  ./deploy.sh              # pull, deps, build, convex, restart web+worker
  ./deploy.sh install      # installe / active les units systemd (sudo)
  ./deploy.sh restart      # restart web+worker seulement
  ./deploy.sh status       # état des services + git
  ./deploy.sh uninstall    # désactive les units (sudo)

Prérequis: .env.local, worker/.env, worker/.venv, Node 20+, cloudflared déjà up.
EOF
}

case "${1:-deploy}" in
  deploy|"") cmd_deploy ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  -h|--help|help) usage ;;
  *) err "Commande inconnue: $1"; usage; exit 1 ;;
esac

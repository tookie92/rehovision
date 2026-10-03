#!/usr/bin/env bash
# Génère une clé admin pour le backend Convex self-hosted (Docker).
# Doc: https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec backend ./generate_admin_key.sh

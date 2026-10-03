#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export PATH="$ROOT/vendor/ACE-Step-1.5/.venv/bin:$PATH"
# shellcheck disable=SC1091
set -a; source "$ROOT/.env"; set +a
exec "$ROOT/vendor/ACE-Step-1.5/.venv/bin/python" "$ROOT/main.py"

#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET=""
LOCAL_API_PORT="${LOCAL_API_PORT:-18080}"
REMOTE_API_PORT="${REMOTE_API_PORT:-8080}"
LOCAL_UI_PORT="${LOCAL_UI_PORT:-14173}"
REMOTE_UI_PORT="${REMOTE_UI_PORT:-4173}"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/ssh-tunnel-to-node.sh user@altiair-hub.local

Environment overrides:
  LOCAL_API_PORT     Local API port. Default: 18080
  REMOTE_API_PORT    Remote node API port. Default: 8080
  LOCAL_UI_PORT      Local UI port. Default: 14173
  REMOTE_UI_PORT     Remote UI port. Default: 4173

Then use:
  http://127.0.0.1:18080/dashboard
  http://127.0.0.1:14173/
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SSH_TARGET="${1:-}"
if [[ -z "$SSH_TARGET" ]]; then
  echo "Required: SSH target, e.g. user@altiair-hub.local" >&2
  usage >&2
  exit 2
fi

exec ssh -N \
  -L "${LOCAL_API_PORT}:127.0.0.1:${REMOTE_API_PORT}" \
  -L "${LOCAL_UI_PORT}:127.0.0.1:${REMOTE_UI_PORT}" \
  "$SSH_TARGET"

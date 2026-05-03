#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${ALTIAIR_APP_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
ENV_FILE="${ALTIAIR_ENV_FILE:-/etc/altiair/altiair-node.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export ALTIAIR_NODE_ID="${ALTIAIR_NODE_ID:-altiair-hub}"
export ALTIAIR_API_HOST="${ALTIAIR_API_HOST:-0.0.0.0}"
export ALTIAIR_API_PORT="${ALTIAIR_API_PORT:-8080}"
export ALTIAIR_MISSION_ID="${ALTIAIR_MISSION_ID:-mission-live-edge}"
export ALTIAIR_OPERATOR_AUTHORIZED="${ALTIAIR_OPERATOR_AUTHORIZED:-false}"
export LOCAL_LLM_MODE="${LOCAL_LLM_MODE:-mock}"
export LOCAL_LLM_BASE_URL="${LOCAL_LLM_BASE_URL:-http://127.0.0.1:11434}"
export LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-gemma4:e2b}"
export FOUNDRY_MODE="${FOUNDRY_MODE:-mock}"

cd "$APP_DIR"
exec npm run node:api -- \
  --node "$ALTIAIR_NODE_ID" \
  --host "$ALTIAIR_API_HOST" \
  --port "$ALTIAIR_API_PORT"

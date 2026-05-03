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

HOST="${ALTIAIR_SENSOR_POST_HOST:-127.0.0.1}"
PORT="${ALTIAIR_API_PORT:-8080}"
URL="${ALTIAIR_SENSOR_POST_URL:-http://${HOST}:${PORT}/sensor-events}"

cd "$APP_DIR"
exec npm run mock:replay -- --post-url "$URL" "$@"

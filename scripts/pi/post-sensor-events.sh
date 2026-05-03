#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ALTIAIR_ENV_FILE:-/etc/altiair/altiair-node.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HOST="${ALTIAIR_POST_HOST:-127.0.0.1}"
PORT="${ALTIAIR_API_PORT:-8080}"
URL="${ALTIAIR_SENSOR_POST_URL:-http://${HOST}:${PORT}/sensor-events}"
INPUT="${1:-/dev/stdin}"

headers=(-H "content-type: application/json")
if [[ -n "${ALTIAIR_API_TOKEN:-}" ]]; then
  headers+=(-H "authorization: Bearer ${ALTIAIR_API_TOKEN}")
fi

curl -sS -X POST "$URL" "${headers[@]}" --data-binary "@${INPUT}"

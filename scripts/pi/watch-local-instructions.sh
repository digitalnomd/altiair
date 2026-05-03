#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ALTIAIR_ENV_FILE:-/etc/altiair/altiair-node.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HOST="${ALTIAIR_WATCH_HOST:-127.0.0.1}"
PORT="${ALTIAIR_API_PORT:-8080}"
URL="${ALTIAIR_INSTRUCTIONS_URL:-http://${HOST}:${PORT}/instructions/latest}"
INTERVAL_SECONDS="${ALTIAIR_WATCH_INTERVAL_SECONDS:-2}"

headers=()
if [[ -n "${ALTIAIR_API_TOKEN:-}" ]]; then
  headers+=(-H "authorization: Bearer ${ALTIAIR_API_TOKEN}")
fi

while true; do
  clear
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  if ! curl -fsS "$URL" "${headers[@]}" | node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const body = JSON.parse(input);
  console.log(JSON.stringify(body, null, 2));
});
'; then
    echo "No local CASK instructions yet. Post sensor events or wait for peer replication."
  fi
  sleep "$INTERVAL_SECONDS"
done

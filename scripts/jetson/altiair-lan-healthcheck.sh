#!/usr/bin/env bash
set -euo pipefail

JETSON_URL="${ALTIAIR_JETSON_URL:-http://127.0.0.1:8080/health}"
NODE_A_URL="${ALTIAIR_NODE_A_URL:-http://192.168.42.11:8081/health}"
NODE_B_URL="${ALTIAIR_NODE_B_URL:-http://192.168.42.12:8082/health}"
TIMEOUT="${ALTIAIR_HEALTH_TIMEOUT:-4}"

check_url() {
  local label="$1"
  local url="$2"
  printf '%s ' "$label"
  if curl -fsS --max-time "$TIMEOUT" "$url"; then
    printf '\n'
    return 0
  fi
  printf 'UNREACHABLE %s\n' "$url"
  return 1
}

status=0
check_url jetson "$JETSON_URL" || status=1
check_url node-a "$NODE_A_URL" || status=1
check_url node-b "$NODE_B_URL" || status=1
exit "$status"

#!/usr/bin/env bash
set -euo pipefail

# Run from the Jetson or any machine that can SSH to the Altiair LAN nodes.
# Default mode checks node-local Ollama/runtime state only. Use --apply to run
# scripts/pi/install-local-llm.sh on each target, which downloads Ollama/model
# weights when missing.

MODE="check"
INCLUDE_PI5=0
REMOTE_USER="${ALTIAIR_NODE_USER:-altiair}"
REMOTE_DIR="${ALTIAIR_REMOTE_APP_DIR:-/opt/altiair}"
LOCAL_DIR="${ALTIAIR_LOCAL_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
MODEL="${LOCAL_LLM_MODEL:-gemma4:e2b}"
FALLBACK_MODEL="${ALTIAIR_LLM_FALLBACK_MODEL:-gemma3:1b}"
SSH_OPTS=(
  -o ConnectTimeout=8
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
)

usage() {
  cat <<EOF
Usage: scripts/jetson/fleet-local-llm.sh [--check|--apply] [--include-pi5]

Targets:
  altiair-orin   local node when run on the Jetson, otherwise SSH 192.168.42.20
  altiair-node-a SSH 192.168.42.11
  altiair-node-b SSH 192.168.42.12
  altiair-hub    SSH 192.168.42.10 when --include-pi5 is set

--check is non-destructive. --apply installs/repairs Ollama and switches each
node env to LOCAL_LLM_MODE=ollama.
EOF
}

while (($# > 0)); do
  case "$1" in
    --check)
      MODE="check"
      ;;
    --apply)
      MODE="apply"
      ;;
    --include-pi5)
      INCLUDE_PI5=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

targets=(
  "altiair-orin|192.168.42.20|8080|local-ok"
  "altiair-node-a|192.168.42.11|8081|remote"
  "altiair-node-b|192.168.42.12|8082|remote"
)

if [[ "$INCLUDE_PI5" == "1" ]]; then
  targets+=("altiair-hub|192.168.42.10|8080|remote")
fi

check_script='
set -euo pipefail
env_value() {
  sed -n "s/^${1}=//p" /etc/altiair/altiair-node.env 2>/dev/null | tail -n 1
}
echo "host=$(hostname)"
echo "node_id=$(env_value ALTIAIR_NODE_ID)"
echo "llm_mode=$(env_value LOCAL_LLM_MODE)"
echo "llm_model=$(env_value LOCAL_LLM_MODEL)"
echo "altiair_node=$(systemctl is-active altiair-node 2>/dev/null || true)"
echo "ollama_bin=$(command -v ollama || true)"
echo "ollama_service=$(systemctl is-active ollama 2>/dev/null || true)"
if curl -fsS --max-time 3 http://127.0.0.1:11434/api/tags >/tmp/altiair-ollama-tags.json 2>/dev/null; then
  echo "ollama_api=ready"
  node -e "const fs=require(\"fs\"); const body=JSON.parse(fs.readFileSync(\"/tmp/altiair-ollama-tags.json\",\"utf8\")); console.log(\"ollama_models=\"+(body.models||[]).map(m=>m.name).join(\",\"));" 2>/dev/null || true
else
  echo "ollama_api=unreachable"
fi
if curl -fsS --max-time 3 "http://127.0.0.1:${ALTIAIR_API_PORT:-8080}/health" >/tmp/altiair-node-health.json 2>/dev/null; then
  node -e "const fs=require(\"fs\"); const body=JSON.parse(fs.readFileSync(\"/tmp/altiair-node-health.json\",\"utf8\")); console.log(\"api_health=ready node=\"+(body.nodeId||\"unknown\")+\" model=\"+(body.modelStatus||\"unknown\"));" 2>/dev/null || echo "api_health=ready"
else
  echo "api_health=unreachable"
fi
'

apply_script='
set -euo pipefail
cd "$ALTIAIR_REMOTE_DIR"
git pull --ff-only || true
LOCAL_LLM_MODEL="$ALTIAIR_MODEL" ALTIAIR_LLM_FALLBACK_MODEL="$ALTIAIR_FALLBACK_MODEL" scripts/pi/install-local-llm.sh
'

run_local() {
  local port="$1"
  if [[ "$MODE" == "apply" ]]; then
    (cd "$LOCAL_DIR" && LOCAL_LLM_MODEL="$MODEL" ALTIAIR_LLM_FALLBACK_MODEL="$FALLBACK_MODEL" scripts/pi/install-local-llm.sh)
  else
    ALTIAIR_API_PORT="$port" bash -lc "$check_script"
  fi
}

run_remote() {
  local host="$1"
  local port="$2"
  if [[ "$MODE" == "apply" ]]; then
    ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${host}" \
      "ALTIAIR_REMOTE_DIR='${REMOTE_DIR}' ALTIAIR_MODEL='${MODEL}' ALTIAIR_FALLBACK_MODEL='${FALLBACK_MODEL}' bash -lc '$apply_script'"
  else
    ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${host}" "ALTIAIR_API_PORT='${port}' bash -lc '$check_script'"
  fi
}

local_hostname="$(hostname 2>/dev/null || true)"
status=0

for target in "${targets[@]}"; do
  IFS='|' read -r node_id host port mode_hint <<<"$target"
  echo "== ${node_id} ${host}:${port} =="
  if [[ "$node_id" == "altiair-orin" && "$mode_hint" == "local-ok" && "$local_hostname" == "altiair-orin" ]]; then
    run_local "$port" || status=1
  else
    run_remote "$host" "$port" || status=1
  fi
done

exit "$status"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NODE_ID="${ALTIAIR_DEMO_NODE_ID:-${ALTIAIR_NODE_ID:-altiair-orin}}"
API_HOST="${ALTIAIR_DEMO_API_HOST:-${ALTIAIR_API_HOST:-127.0.0.1}}"
API_PORT="${ALTIAIR_DEMO_API_PORT:-${ALTIAIR_API_PORT:-8080}}"
UI_HOST="${ALTIAIR_DEMO_UI_HOST:-${ALTIAIR_UI_HOST:-127.0.0.1}}"
UI_PORT="${ALTIAIR_DEMO_UI_PORT:-${ALTIAIR_UI_PORT:-4173}}"
TOKEN="${ALTIAIR_DEMO_API_TOKEN:-${ALTIAIR_API_TOKEN:-demo-local-token}}"
MISSION_ID="${ALTIAIR_DEMO_MISSION_ID:-${ALTIAIR_MISSION_ID:-mission-live-edge}}"
LOCAL_LLM_MODE="${LOCAL_LLM_MODE:-mock}"
FOUNDRY_MODE="${FOUNDRY_MODE:-mock}"
LOCAL_LLM_BASE_URL="${LOCAL_LLM_BASE_URL:-http://127.0.0.1:11434}"

INCLUDE_PI5=0
INCLUDE_FAILURE_STEP=0
START_UI=1
START_HAWKEYE=0
BOOTSTRAP_ONLY=0
SKIP_UPLOAD=0
HAWKEYE_INTERVAL_MS="${ALTIAIR_DEMO_HAWKEYE_INTERVAL_MS:-10000}"
LOG_DIR="${ALTIAIR_DEMO_LOG_DIR:-}"

usage() {
  cat <<'EOF'
Usage: scripts/demo-start.sh [options]

Starts the local node API, waits for /health, seeds the demo with
demo:bootstrap, starts the UI proxy, and keeps the processes running.

Options:
  --node <id>              Node id to run. Default: altiair-orin
  --host <host>            Node API host. Default: 127.0.0.1
  --port <port>            Node API port. Default: 8080
  --ui-host <host>         UI host. Default: 127.0.0.1
  --ui-port <port>         UI port. Default: 4173
  --mission <id>           Mission id. Default: mission-live-edge
  --llm-mode <mode>        mock or ollama. Default: LOCAL_LLM_MODE or mock
  --foundry-mode <mode>    mock or osdk. Default: FOUNDRY_MODE or mock
  --include-pi5            Include the Pi 5 hub in the mock scenario.
  --include-failure-step   Add the node-loss rehearsal step.
  --hawkeye                Start the continuous Hawkeye-style feed.
  --hawkeye-interval-ms N  Interval for Hawkeye feed. Default: 10000
  --no-ui                  Do not start the UI proxy.
  --skip-upload            Do not call /foundry/upload during bootstrap.
  --once                   Seed and verify once, then stop background services.
  --log-dir <dir>          Write logs to this directory.
  -h, --help               Show this help.

Environment overrides:
  ALTIAIR_DEMO_API_TOKEN, ALTIAIR_DEMO_API_PORT, ALTIAIR_DEMO_UI_PORT,
  LOCAL_LLM_MODE, LOCAL_LLM_BASE_URL, FOUNDRY_MODE
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --node)
      NODE_ID="${2:?missing value for --node}"
      shift 2
      ;;
    --host)
      API_HOST="${2:?missing value for --host}"
      shift 2
      ;;
    --port)
      API_PORT="${2:?missing value for --port}"
      shift 2
      ;;
    --ui-host)
      UI_HOST="${2:?missing value for --ui-host}"
      shift 2
      ;;
    --ui-port)
      UI_PORT="${2:?missing value for --ui-port}"
      shift 2
      ;;
    --mission)
      MISSION_ID="${2:?missing value for --mission}"
      shift 2
      ;;
    --llm-mode)
      LOCAL_LLM_MODE="${2:?missing value for --llm-mode}"
      shift 2
      ;;
    --foundry-mode)
      FOUNDRY_MODE="${2:?missing value for --foundry-mode}"
      shift 2
      ;;
    --include-pi5)
      INCLUDE_PI5=1
      shift
      ;;
    --include-failure-step)
      INCLUDE_FAILURE_STEP=1
      shift
      ;;
    --hawkeye)
      START_HAWKEYE=1
      shift
      ;;
    --hawkeye-interval-ms)
      HAWKEYE_INTERVAL_MS="${2:?missing value for --hawkeye-interval-ms}"
      shift 2
      ;;
    --no-ui)
      START_UI=0
      shift
      ;;
    --skip-upload)
      SKIP_UPLOAD=1
      shift
      ;;
    --once)
      BOOTSTRAP_ONLY=1
      shift
      ;;
    --log-dir)
      LOG_DIR="${2:?missing value for --log-dir}"
      shift 2
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
done

if [[ "$LOG_DIR" == "" ]]; then
  LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/altiair-demo.XXXXXX")"
else
  mkdir -p "$LOG_DIR"
fi

API_PID=""
UI_PID=""
HAWKEYE_PID=""

cleanup() {
  local status=$?
  for pid in "$HAWKEYE_PID" "$UI_PID" "$API_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  if [[ "$BOOTSTRAP_ONLY" == "1" && "${ALTIAIR_DEMO_KEEP_LOGS:-0}" != "1" && "$LOG_DIR" == "${TMPDIR:-/tmp}"/altiair-demo.* ]]; then
    rm -rf "$LOG_DIR"
  elif [[ $status -ne 0 ]]; then
    echo "Logs: $LOG_DIR" >&2
  fi
}
trap cleanup EXIT INT TERM

auth_header=(-H "authorization: Bearer ${TOKEN}")
api_base="http://${API_HOST}:${API_PORT}"
ui_base="http://${UI_HOST}:${UI_PORT}"

wait_for_url() {
  local url="$1"
  local name="$2"
  local log_file="$3"
  local ready=0

  for _ in {1..100}; do
    if curl -fsS "${auth_header[@]}" "$url" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.2
  done

  if [[ "$ready" != "1" ]]; then
    echo "$name did not become ready at $url" >&2
    if [[ -f "$log_file" ]]; then
      echo "--- $name log ---" >&2
      cat "$log_file" >&2
    fi
    exit 1
  fi
}

cd "$ROOT_DIR"

echo "Starting Altiair node API on ${api_base} (${NODE_ID})"
ALTIAIR_NODE_ID="$NODE_ID" \
ALTIAIR_API_HOST="$API_HOST" \
ALTIAIR_API_PORT="$API_PORT" \
ALTIAIR_API_TOKEN="$TOKEN" \
LOCAL_LLM_MODE="$LOCAL_LLM_MODE" \
LOCAL_LLM_BASE_URL="$LOCAL_LLM_BASE_URL" \
FOUNDRY_MODE="$FOUNDRY_MODE" \
npx tsx src/scripts/node-api.ts --node "$NODE_ID" --host "$API_HOST" --port "$API_PORT" \
  >"${LOG_DIR}/node-api.log" 2>&1 &
API_PID="$!"

wait_for_url "${api_base}/health" "node API" "${LOG_DIR}/node-api.log"

bootstrap_args=(--base-url "$api_base" --mission "$MISSION_ID")
if [[ "$INCLUDE_PI5" == "1" ]]; then
  bootstrap_args+=(--include-pi5)
fi
if [[ "$INCLUDE_FAILURE_STEP" == "1" ]]; then
  bootstrap_args+=(--include-failure-step)
fi
if [[ "$SKIP_UPLOAD" == "1" ]]; then
  bootstrap_args+=(--skip-upload)
fi

echo "Seeding demo mission and sensor scenario"
ALTIAIR_API_TOKEN="$TOKEN" \
npx tsx src/scripts/demo-bootstrap.ts "${bootstrap_args[@]}" \
  >"${LOG_DIR}/bootstrap.json"

curl -fsS "${auth_header[@]}" "${api_base}/dashboard" >"${LOG_DIR}/dashboard.json"
curl -fsS "${auth_header[@]}" "${api_base}/stream/status" >"${LOG_DIR}/stream.json"
curl -fsS "${auth_header[@]}" "${api_base}/coordinator/latest" >"${LOG_DIR}/coordinator.json"
curl -fsS "${auth_header[@]}" "${api_base}/insights/latest" >"${LOG_DIR}/insight.json"

if [[ "$START_UI" == "1" ]]; then
  echo "Starting UI proxy on ${ui_base}"
  ALTIAIR_API_TOKEN="$TOKEN" \
  node ui/server.mjs --host "$UI_HOST" --port "$UI_PORT" --target "$api_base" \
    >"${LOG_DIR}/ui.log" 2>&1 &
  UI_PID="$!"
  wait_for_url "${ui_base}/api/health" "UI proxy" "${LOG_DIR}/ui.log"
fi

if [[ "$START_HAWKEYE" == "1" ]]; then
  echo "Starting Hawkeye-style feed"
  ALTIAIR_API_TOKEN="$TOKEN" \
  ALTIAIR_SENSOR_POST_URL="${api_base}/sensor-events" \
  npx tsx src/scripts/hawkeye-feed.ts --post-url "${api_base}/sensor-events" --interval-ms "$HAWKEYE_INTERVAL_MS" \
    >"${LOG_DIR}/hawkeye-feed.log" 2>&1 &
  HAWKEYE_PID="$!"
fi

SUMMARY_LOG_DIR="$LOG_DIR" \
SUMMARY_API_BASE="$api_base" \
SUMMARY_UI_BASE="$ui_base" \
SUMMARY_START_UI="$START_UI" \
node <<'NODE'
const fs = require("fs");
const dir = process.env.SUMMARY_LOG_DIR;
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}.json`, "utf8"));
const bootstrap = read("bootstrap");
const dashboard = read("dashboard");
const stream = read("stream");
const coordinator = read("coordinator");
const insight = read("insight");

if (bootstrap.ready !== true) throw new Error("demo bootstrap did not report ready=true");
if (!dashboard.nodeApi?.ledger?.latestBundleId) throw new Error("dashboard missing latest bundle");
if (!stream.totalRecords || stream.totalRecords < 1) throw new Error("stream did not populate");
if (!coordinator.election?.authorityState) throw new Error("coordinator election state missing");
if (!insight.id) throw new Error("local insight missing");

console.log(JSON.stringify({
  demo: "ready",
  nodeId: dashboard.nodeApi.health.nodeId,
  missionId: bootstrap.missionId,
  api: process.env.SUMMARY_API_BASE,
  ui: process.env.SUMMARY_START_UI === "1" ? process.env.SUMMARY_UI_BASE : null,
  latestBundleId: dashboard.nodeApi.ledger.latestBundleId,
  streamRecords: stream.totalRecords,
  coordinatorLeader: coordinator.election.leaderId ?? null,
  coordinatorState: coordinator.election.authorityState,
  insightModel: insight.model,
  logs: dir
}, null, 2));
NODE

if [[ "$BOOTSTRAP_ONLY" == "1" ]]; then
  exit 0
fi

echo
echo "Demo is running."
echo "API: ${api_base}"
if [[ "$START_UI" == "1" ]]; then
  echo "UI:  ${ui_base}"
fi
echo "Logs: ${LOG_DIR}"
echo "Press Ctrl-C to stop."

while true; do
  sleep 3600 &
  wait $!
done

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ALTIAIR_WORKFLOW_SMOKE_PORT:-18100}"
TOKEN="${ALTIAIR_WORKFLOW_SMOKE_TOKEN:-workflow-smoke-token}"
TMP_DIR="$(mktemp -d)"
PID=""

cleanup() {
  if [[ -n "$PID" ]]; then
    kill "$PID" >/dev/null 2>&1 || true
    wait "$PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"

ALTIAIR_NODE_ID=altiair-orin \
ALTIAIR_API_HOST=127.0.0.1 \
ALTIAIR_API_PORT="$PORT" \
ALTIAIR_API_TOKEN="$TOKEN" \
LOCAL_LLM_MODE=mock \
FOUNDRY_MODE=mock \
npx tsx src/scripts/node-api.ts --node altiair-orin --host 127.0.0.1 --port "$PORT" \
  >"${TMP_DIR}/node-api.log" 2>&1 &
PID="$!"

ready=0
for _ in {1..60}; do
  if curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/health" \
    >"${TMP_DIR}/health.json" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" != "1" ]]; then
  cat "${TMP_DIR}/node-api.log" >&2
  exit 1
fi

ALTIAIR_API_TOKEN="$TOKEN" \
npx tsx src/scripts/demo-bootstrap.ts \
  --base-url "http://127.0.0.1:${PORT}" \
  --skip-upload \
  >"${TMP_DIR}/bootstrap.json"

ALTIAIR_API_TOKEN="$TOKEN" \
npx tsx src/scripts/mock-scenario.ts \
  --replay \
  --post-url "http://127.0.0.1:${PORT}/sensor-events" \
  --delay-ms 0 \
  >"${TMP_DIR}/replay.json"

curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/dashboard" \
  >"${TMP_DIR}/dashboard.json"
curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/stream/status" \
  >"${TMP_DIR}/stream.json"
curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/ledger" \
  >"${TMP_DIR}/ledger.json"
curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/coordinator/latest" \
  >"${TMP_DIR}/coordinator.json"
curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/insights/latest" \
  >"${TMP_DIR}/insight.json"
curl -fsS -H "authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PORT}/mission/deployment/latest" \
  >"${TMP_DIR}/deployment.json"

TMP_DIR="$TMP_DIR" node <<'NODE'
const fs = require("fs");
const dir = process.env.TMP_DIR;
const read = (name) => JSON.parse(fs.readFileSync(`${dir}/${name}.json`, "utf8"));

const bootstrap = read("bootstrap");
const replay = read("replay");
const dashboard = read("dashboard");
const stream = read("stream");
const ledger = read("ledger");
const coordinator = read("coordinator");
const insight = read("insight");
const deployment = read("deployment");

if (bootstrap.ready !== true) throw new Error("demo bootstrap did not report ready=true");
if (replay.replayed !== true || replay.stepCount < 1) throw new Error("mock replay did not run");
if (!dashboard.nodeApi?.ledger?.latestBundleId) throw new Error("dashboard missing ledger latest bundle");
if (!stream.totalRecords || stream.totalRecords < 1) throw new Error("stream did not populate");
if (!ledger.storedRecordCount || ledger.storedRecordCount < 1) throw new Error("ledger did not populate");
if (!coordinator.election?.leaderId) throw new Error("coordinator leader missing");
if (!insight.id || insight.policyState !== "review_needed") throw new Error("local insight missing");
if (deployment.state !== "deployed") throw new Error("mission deployment is not deployed");

console.log(JSON.stringify({
  workflowSmoke: "passed",
  nodeId: dashboard.nodeApi.health.nodeId,
  bootstrapReady: bootstrap.ready,
  replayStepCount: replay.stepCount,
  latestBundleId: dashboard.nodeApi.ledger.latestBundleId,
  streamRecords: stream.totalRecords,
  ledgerRecords: ledger.storedRecordCount,
  coordinatorLeader: coordinator.election.leaderId,
  insightModel: insight.model,
  deploymentState: deployment.state
}, null, 2));
NODE

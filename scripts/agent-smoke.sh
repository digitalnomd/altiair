#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ALTIAIR_AGENT_SMOKE_PORT:-18090}"
TOKEN="${ALTIAIR_AGENT_SMOKE_TOKEN:-agent-smoke-token}"
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

ALTIAIR_NODE_ID=altiair-agent-smoke \
ALTIAIR_AGENT_BIND="127.0.0.1:${PORT}" \
ALTIAIR_AGENT_DB="${TMP_DIR}/altiair-agent.sqlite" \
ALTIAIR_API_TOKEN="$TOKEN" \
ALTIAIR_AGENT_SIGNING_SECRET=agent-smoke-signing \
ALTIAIR_AGENT_ENCRYPTION_SECRET=agent-smoke-encryption \
cargo run -p altiair-agent --quiet >"${TMP_DIR}/agent.log" 2>&1 &
PID="$!"

ready=0
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >"${TMP_DIR}/health.json" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" != "1" ]]; then
  cat "${TMP_DIR}/agent.log" >&2
  exit 1
fi

curl -fsS \
  -X POST "http://127.0.0.1:${PORT}/bundles" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data-binary "@agent/fixtures/sample-bundle.json" \
  >"${TMP_DIR}/bundle.json"

curl -fsS \
  -X POST "http://127.0.0.1:${PORT}/acks" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  --data '{"recordId":"bundle:bundle-agent-smoke-001","peerNodeId":"altiair-node-a"}' \
  >"${TMP_DIR}/ack.json"

curl -fsS \
  -H "authorization: Bearer ${TOKEN}" \
  "http://127.0.0.1:${PORT}/ledger" \
  >"${TMP_DIR}/ledger.json"

curl -fsS \
  -H "authorization: Bearer ${TOKEN}" \
  "http://127.0.0.1:${PORT}/records/bundle:bundle-agent-smoke-001" \
  >"${TMP_DIR}/record.json"

TMP_DIR="$TMP_DIR" node <<'NODE'
const fs = require("fs");
const dir = process.env.TMP_DIR;
const health = JSON.parse(fs.readFileSync(`${dir}/health.json`, "utf8"));
const ledger = JSON.parse(fs.readFileSync(`${dir}/ledger.json`, "utf8"));
const record = JSON.parse(fs.readFileSync(`${dir}/record.json`, "utf8"));

if (health.memorySafe?.language !== "Rust" || health.memorySafe?.forbidUnsafeCode !== true) {
  throw new Error("health did not report Rust memory-safe mode");
}
if (ledger.recordCount !== 1 || ledger.encryptedAtRest !== true || ledger.signedRecords !== true) {
  throw new Error("ledger did not report one signed encrypted record");
}
if (record.payload?.id !== "bundle-agent-smoke-001" || record.ackCount !== 1) {
  throw new Error("stored record did not round-trip with ack count");
}

console.log(JSON.stringify({
  agentSmoke: "passed",
  nodeId: health.nodeId,
  recordCount: ledger.recordCount,
  encryptedAtRest: ledger.encryptedAtRest,
  signedRecords: ledger.signedRecords,
  signing: health.signing,
  storage: health.storage
}, null, 2));
NODE

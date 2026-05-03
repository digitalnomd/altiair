#!/usr/bin/env bash
set -euo pipefail

# Run on the Mac operator machine. This script deliberately never joins,
# leaves, or modifies Wi-Fi networks. It keeps the Mac internet path intact and
# uses whichever existing route is available: direct Altiair-LAN reachability or
# the Jetson USB-C gadget.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

JETSON_USER="${ALTIAIR_JETSON_USER:-altiair}"
JETSON_USB_IP="${ALTIAIR_JETSON_USB_IP:-192.168.55.1}"
JETSON_USB_URL="${ALTIAIR_JETSON_USB_URL:-http://${JETSON_USB_IP}:8080}"
JETSON_LAN_URL="${ALTIAIR_JETSON_URL:-http://192.168.42.20:8080}"
NODE_A_URL="${ALTIAIR_NODE_A_URL:-http://192.168.42.11:8081}"
NODE_B_URL="${ALTIAIR_NODE_B_URL:-http://192.168.42.12:8082}"
PI5_URL="${ALTIAIR_PI5_URL:-http://192.168.42.10:8080}"
REMOTE_DIR="${ALTIAIR_REMOTE_APP_DIR:-/opt/altiair}"
TIMEOUT="${ALTIAIR_HEALTH_TIMEOUT:-4}"
REQUIRE_LLM_MODE="${ALTIAIR_REQUIRE_LLM_MODE:-ollama}"
KNOWN_HOSTS="${ALTIAIR_JETSON_KNOWN_HOSTS:-/tmp/altiair-jetson-known-hosts}"

mode="status"
setup_usb=0
include_pi5=0
skip_seed=0

usage() {
  cat <<EOF
Usage: scripts/jetson/operator-mesh-proof.sh [options]

Options:
  --status              Check routes and health only. This is the default.
  --local-integration   Run npm live:mesh:integration from this Mac if direct
                        Altiair-LAN HTTP endpoints are reachable.
  --remote-integration  SSH over Jetson USB and run live:mesh:integration on
                        the Jetson, where node-a/node-b are LAN-local.
  --setup-usb           Repair only the Mac side Jetson USB route first.
  --include-pi5         Require the Pi 5 slot too.
  --skip-seed           Do not post the demo mission/sensor replay.

This helper does not change Mac Wi-Fi association.
EOF
}

while (($# > 0)); do
  case "$1" in
    --status)
      mode="status"
      ;;
    --local-integration)
      mode="local-integration"
      ;;
    --remote-integration)
      mode="remote-integration"
      ;;
    --setup-usb)
      setup_usb=1
      ;;
    --include-pi5)
      include_pi5=1
      ;;
    --skip-seed)
      skip_seed=1
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

check_url() {
  local label="$1"
  local url="$2"
  printf '%-18s %s ' "$label" "$url"
  if curl -fsS --max-time "$TIMEOUT" "${url%/}/health" >/tmp/altiair-mesh-proof.json 2>/tmp/altiair-mesh-proof.err; then
    node -e '
      const fs = require("fs");
      const body = JSON.parse(fs.readFileSync("/tmp/altiair-mesh-proof.json", "utf8"));
      console.log(`ok node=${body.nodeId ?? "unknown"} role=${body.nodeRole ?? "unknown"} model=${body.modelStatus ?? "unknown"}`);
    ' 2>/dev/null || echo "ok"
    return 0
  fi
  local err
  err="$(tr '\n' ' ' </tmp/altiair-mesh-proof.err | sed 's/[[:space:]]\\+/ /g')"
  echo "unreachable ${err}"
  return 1
}

check_ssh() {
  local label="$1"
  local host="$2"
  printf '%-18s %s:22 ' "$label" "$host"
  if nc -vz -G 2 "$host" 22 >/tmp/altiair-mesh-proof-ssh.out 2>&1; then
    echo "ok"
    return 0
  fi
  tr '\n' ' ' </tmp/altiair-mesh-proof-ssh.out | sed 's/[[:space:]]\+/ /g; s/^/unreachable /'
  echo
  return 1
}

run_local_integration() {
  local args=(
    --jetson-url "$JETSON_LAN_URL"
    --node-a-url "$NODE_A_URL"
    --node-b-url "$NODE_B_URL"
    --pi5-url "$PI5_URL"
    --require-llm-mode "$REQUIRE_LLM_MODE"
  )
  if [[ "$include_pi5" == "1" ]]; then
    args+=(--include-pi5)
  fi
  if [[ "$skip_seed" == "1" ]]; then
    args+=(--skip-seed)
  fi
  (cd "$REPO_DIR" && npm run live:mesh:integration -- "${args[@]}")
}

run_remote_integration() {
  local remote_args=(
    --jetson-url http://127.0.0.1:8080
    --node-a-url "$NODE_A_URL"
    --node-b-url "$NODE_B_URL"
    --pi5-url "$PI5_URL"
    --require-llm-mode "$REQUIRE_LLM_MODE"
  )
  if [[ "$include_pi5" == "1" ]]; then
    remote_args+=(--include-pi5)
  fi
  if [[ "$skip_seed" == "1" ]]; then
    remote_args+=(--skip-seed)
  fi

  ssh \
    -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=10 \
    "${JETSON_USER}@${JETSON_USB_IP}" \
    "cd '${REMOTE_DIR}' && git pull --ff-only && npm ci && npm run build && npm run live:mesh:integration -- ${remote_args[*]}"
}

default_route="$(route -n get default 2>/dev/null | awk '/gateway:|interface:/ {printf "%s=%s ", $1, $2} END {print ""}' | sed 's/://g')"

echo "Mac Wi-Fi is left unchanged."
echo "en0_ip=$(ipconfig getifaddr en0 2>/dev/null || true)"
echo "default_route=${default_route}"

if [[ "$setup_usb" == "1" ]]; then
  "$SCRIPT_DIR/ssh-usb.sh" --setup-only
fi

echo
echo "Health checks:"
usb_ok=0
usb_ssh_ok=0
direct_ok=0
check_url "jetson-usb" "$JETSON_USB_URL" && usb_ok=1 || true
check_ssh "jetson-usb-ssh" "$JETSON_USB_IP" && usb_ssh_ok=1 || true
if check_url "jetson-lan" "$JETSON_LAN_URL"; then
  direct_ok=1
else
  direct_ok=0
fi
check_url "node-a" "$NODE_A_URL" || direct_ok=0
check_url "node-b" "$NODE_B_URL" || direct_ok=0
if [[ "$include_pi5" == "1" ]]; then
  check_url "pi5" "$PI5_URL" || direct_ok=0
else
  check_url "pi5-reserved" "$PI5_URL" || true
fi

case "$mode" in
  status)
    if [[ "$direct_ok" == "1" ]]; then
      echo "status=direct-lan-ready"
    elif [[ "$usb_ssh_ok" == "1" ]]; then
      echo "status=jetson-usb-ready; use --remote-integration for the full proof from the Jetson"
    else
      echo "status=no-device-route; keep Mac Wi-Fi alone and reconnect/power the Jetson USB-C data link" >&2
      exit 1
    fi
    ;;
  local-integration)
    if [[ "$direct_ok" != "1" ]]; then
      echo "Direct Altiair-LAN endpoints are not reachable from this Mac." >&2
      echo "Use --remote-integration over Jetson USB, or run this from a machine on Altiair-LAN." >&2
      exit 1
    fi
    run_local_integration
    ;;
  remote-integration)
    if [[ "$usb_ssh_ok" != "1" ]]; then
      echo "Jetson USB SSH is not reachable at ${JETSON_USB_IP}:22." >&2
      echo "Use --setup-usb after the Jetson USB-C data link is present." >&2
      exit 1
    fi
    run_remote_integration
    ;;
esac

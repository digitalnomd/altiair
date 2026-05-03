#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${ALTIAIR_APP_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SERVICE_NAME="${ALTIAIR_SERVICE_NAME:-altiair-node}"
ENV_DIR="${ALTIAIR_ENV_DIR:-/etc/altiair}"
ENV_FILE="${ALTIAIR_ENV_FILE:-${ENV_DIR}/altiair-node.env}"
NODE_ID="${ALTIAIR_NODE_ID:-altiair-hub}"
NODE_PORT="${ALTIAIR_API_PORT:-8080}"
BOOT_ENV_FILES=(
  "/boot/firmware/altiair-node.env"
  "/boot/altiair-node.env"
)

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl git build-essential nodejs npm
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
if [[ "$node_major" -lt 18 ]]; then
  echo "Node.js 18+ is required. Install Node 20 LTS for Raspberry Pi OS, then rerun this script." >&2
  exit 1
fi

cd "$APP_DIR"
npm ci

sudo mkdir -p "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  BOOT_ENV_FILE=""
  for candidate in "${BOOT_ENV_FILES[@]}"; do
    if [[ -f "$candidate" ]]; then
      BOOT_ENV_FILE="$candidate"
      break
    fi
  done

  if [[ -n "$BOOT_ENV_FILE" ]]; then
    sudo cp "$BOOT_ENV_FILE" "$ENV_FILE"
  else
    sudo tee "$ENV_FILE" >/dev/null <<EOF
ALTIAIR_NODE_ID=${NODE_ID}
ALTIAIR_API_HOST=0.0.0.0
ALTIAIR_API_PORT=${NODE_PORT}
ALTIAIR_MISSION_ID=mission-live-edge
ALTIAIR_OPERATOR_AUTHORIZED=false
LOCAL_LLM_MODE=ollama
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=gemma4:e2b
FOUNDRY_MODE=mock
FOUNDRY_UPLOAD_PROFILE=cask_gps_position
FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION=createExampleCaskGpsPosition
FOUNDRY_ACTION_PAYLOAD_STYLE=raw
EOF
  fi
  sudo chown "${USER}:${USER}" "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
fi

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Altiair CASK edge node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=ALTIAIR_APP_DIR=${APP_DIR}
Environment=ALTIAIR_ENV_FILE=${ENV_FILE}
EnvironmentFile=-${ENV_FILE}
ExecStart=${APP_DIR}/scripts/pi/run-altiair-node.sh
Restart=always
RestartSec=3
User=${USER}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" || true

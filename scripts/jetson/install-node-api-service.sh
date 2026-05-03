#!/usr/bin/env bash
set -euo pipefail

# Run on the Jetson. Install the bundled Altiair node API as a systemd service.
# This expects a prebuilt node-api.mjs bundle and a Node binary already present.

APP_DIR="${ALTIAIR_APP_DIR:-/opt/altiair}"
ENV_DIR="${ALTIAIR_ENV_DIR:-/etc/altiair}"
ENV_FILE="${ALTIAIR_ENV_FILE:-${ENV_DIR}/altiair-node.env}"
SERVICE_NAME="${ALTIAIR_SERVICE_NAME:-altiair-node}"
NODE_BIN="${ALTIAIR_NODE_BIN:-/opt/node/bin/node}"
BUNDLE_SOURCE="${1:-./node-api.mjs}"

if [[ ! -f "$BUNDLE_SOURCE" ]]; then
  echo "Bundle not found: ${BUNDLE_SOURCE}" >&2
  exit 1
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node binary not found or not executable: ${NODE_BIN}" >&2
  exit 1
fi

sudo install -d -m 0755 "$APP_DIR" "$ENV_DIR"
sudo install -m 0644 "$BUNDLE_SOURCE" "$APP_DIR/node-api.mjs"

if [[ ! -f "$ENV_FILE" ]]; then
  sudo tee "$ENV_FILE" >/dev/null <<'EOF'
ALTIAIR_NODE_ID=altiair-orin
ALTIAIR_API_HOST=0.0.0.0
ALTIAIR_API_PORT=8080
ALTIAIR_MISSION_ID=mission-live-edge
ALTIAIR_OPERATOR_AUTHORIZED=false
LOCAL_LLM_MODE=mock
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=gemma3:1b
FOUNDRY_MODE=mock
FOUNDRY_UPLOAD_PROFILE=cask_gps_position
FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION=createExampleCaskGpsPosition
FOUNDRY_ACTION_PAYLOAD_STYLE=raw
EOF
  sudo chmod 600 "$ENV_FILE"
fi

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Altiair CASK edge node API
After=network-online.target altiair-usb-access.service
Wants=network-online.target

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=ALTIAIR_ENV_FILE=${ENV_FILE}
EnvironmentFile=-${ENV_FILE}
ExecStart=${NODE_BIN} ${APP_DIR}/node-api.mjs
Restart=always
RestartSec=3
User=${SUDO_USER:-$USER}

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" || true

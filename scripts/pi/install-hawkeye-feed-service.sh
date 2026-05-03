#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALTIAIR_APP_DIR:-/opt/altiair}"
ENV_DIR="${ALTIAIR_ENV_DIR:-/etc/altiair}"
NODE_ENV_FILE="${ALTIAIR_ENV_FILE:-${ENV_DIR}/altiair-node.env}"
SERVICE_NAME="${ALTIAIR_HAWKEYE_SERVICE_NAME:-altiair-hawkeye-feed}"

sudo install -d -m 0755 "$ENV_DIR"
sudo tee "${ENV_DIR}/altiair-hawkeye-feed.env" >/dev/null <<EOF
ALTIAIR_SENSOR_POST_URL=${ALTIAIR_SENSOR_POST_URL:-http://127.0.0.1:${ALTIAIR_API_PORT:-8080}/sensor-events}
ALTIAIR_HAWKEYE_SOURCE=${ALTIAIR_HAWKEYE_SOURCE:-auto}
ALTIAIR_HAWKEYE_INTERVAL_MS=${ALTIAIR_HAWKEYE_INTERVAL_MS:-10000}
ALTIAIR_HAWKEYE_CAMERA_NODE_ID=${ALTIAIR_HAWKEYE_CAMERA_NODE_ID:-altiair-orin}
ALTIAIR_HAWKEYE_MICROPHONE_NODE_ID=${ALTIAIR_HAWKEYE_MICROPHONE_NODE_ID:-altiair-orin}
ALTIAIR_HAWKEYE_RFID_NODE_ID=${ALTIAIR_HAWKEYE_RFID_NODE_ID:-altiair-node-b}
EOF
sudo chmod 600 "${ENV_DIR}/altiair-hawkeye-feed.env"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Altiair Hawkeye-style online/mock feed
After=altiair-node.service network-online.target
Wants=altiair-node.service network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=-${NODE_ENV_FILE}
EnvironmentFile=${ENV_DIR}/altiair-hawkeye-feed.env
ExecStart=${APP_DIR}/scripts/pi/start-hawkeye-feed.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}.service"
systemctl --no-pager --full status "${SERVICE_NAME}.service" || true

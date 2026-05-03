#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALTIAIR_APP_DIR:-/opt/altiair}"
ENV_DIR="${ALTIAIR_ENV_DIR:-/etc/altiair}"
NODE_ENV_FILE="${ALTIAIR_ENV_FILE:-${ENV_DIR}/altiair-node.env}"
SOURCE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ADAPTERS="${ALTIAIR_SENSOR_ADAPTERS:-auto}"
ZONE_ID="${ALTIAIR_ZONE_ID:-field-zone-alpha}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

camera_source="${SOURCE_DIR}/camera-event-adapter.py"
rfid_source="${SOURCE_DIR}/rfid-event-adapter.py"

if [[ ! -f "$camera_source" || ! -f "$rfid_source" ]]; then
  echo "Expected camera-event-adapter.py and rfid-event-adapter.py under ${SOURCE_DIR}" >&2
  exit 1
fi

sudo install -d -m 0755 "$APP_DIR" "$ENV_DIR"
sudo install -m 0755 "$camera_source" "$APP_DIR/camera-event-adapter.py"
sudo install -m 0755 "$rfid_source" "$APP_DIR/rfid-event-adapter.py"

node_id="unknown-node"
api_port="8080"
if [[ -f "$NODE_ENV_FILE" ]]; then
  node_id="$(grep -E '^ALTIAIR_NODE_ID=' "$NODE_ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  api_port="$(grep -E '^ALTIAIR_API_PORT=' "$NODE_ENV_FILE" | tail -1 | cut -d= -f2- || true)"
fi
node_id="${ALTIAIR_NODE_ID:-${node_id:-unknown-node}}"
api_port="${ALTIAIR_API_PORT:-${api_port:-8080}}"

want_camera=false
want_rfid=false
case ",${ADAPTERS}," in
  *,auto,*)
    [[ "$node_id" == *node-a* ]] && want_camera=true
    [[ "$node_id" == *node-b* ]] && want_rfid=true
    ;;
  *,camera,*) want_camera=true ;;
esac
case ",${ADAPTERS}," in
  *,rfid,*) want_rfid=true ;;
esac

write_camera_service() {
  sudo tee "${ENV_DIR}/altiair-camera-adapter.env" >/dev/null <<EOF
ALTIAIR_NODE_ID=${node_id}
ALTIAIR_API_PORT=${api_port}
ALTIAIR_SENSOR_POST_URL=http://127.0.0.1:${api_port}/sensor-events
ALTIAIR_ZONE_ID=${ZONE_ID}
ALTIAIR_CAMERA_ID=${ALTIAIR_CAMERA_ID:-node-a-camera}
ALTIAIR_CAMERA_DETECTION_CLASS=${ALTIAIR_CAMERA_DETECTION_CLASS:-camera_frame_captured}
ALTIAIR_CAMERA_INTERVAL=${ALTIAIR_CAMERA_INTERVAL:-5}
ALTIAIR_CAMERA_OUTPUT_DIR=${ALTIAIR_CAMERA_OUTPUT_DIR:-/var/lib/altiair/camera}
EOF
  sudo chmod 600 "${ENV_DIR}/altiair-camera-adapter.env"
  sudo install -d -m 0755 /var/lib/altiair/camera
  sudo tee /etc/systemd/system/altiair-camera-adapter.service >/dev/null <<EOF
[Unit]
Description=Altiair camera frame event adapter
After=altiair-node.service network-online.target
Wants=altiair-node.service network-online.target

[Service]
Type=simple
EnvironmentFile=-${NODE_ENV_FILE}
EnvironmentFile=${ENV_DIR}/altiair-camera-adapter.env
ExecStart=/usr/bin/python3 ${APP_DIR}/camera-event-adapter.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

write_rfid_service() {
  sudo tee "${ENV_DIR}/altiair-rfid-adapter.env" >/dev/null <<EOF
ALTIAIR_NODE_ID=${node_id}
ALTIAIR_API_PORT=${api_port}
ALTIAIR_SENSOR_POST_URL=http://127.0.0.1:${api_port}/sensor-events
ALTIAIR_ZONE_ID=${ZONE_ID}
ALTIAIR_READER_ID=${ALTIAIR_READER_ID:-node-b-rfid}
ALTIAIR_ANTENNA_ID=${ALTIAIR_ANTENNA_ID:-antenna-main}
ALTIAIR_RFID_MODE=${ALTIAIR_RFID_MODE:-auto}
EOF
  sudo chmod 600 "${ENV_DIR}/altiair-rfid-adapter.env"
  sudo tee /etc/systemd/system/altiair-rfid-adapter.service >/dev/null <<EOF
[Unit]
Description=Altiair RFID event adapter
After=altiair-node.service network-online.target
Wants=altiair-node.service network-online.target

[Service]
Type=simple
EnvironmentFile=-${NODE_ENV_FILE}
EnvironmentFile=${ENV_DIR}/altiair-rfid-adapter.env
ExecStart=/usr/bin/python3 ${APP_DIR}/rfid-event-adapter.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

if [[ "$want_camera" == true ]]; then
  write_camera_service
fi

if [[ "$want_rfid" == true ]]; then
  write_rfid_service
fi

sudo systemctl daemon-reload
if [[ "$want_camera" == true ]]; then
  sudo systemctl enable --now altiair-camera-adapter.service
fi
if [[ "$want_rfid" == true ]]; then
  sudo systemctl enable --now altiair-rfid-adapter.service
fi

echo "Installed Altiair sensor adapter services for ${node_id}:"
[[ "$want_camera" == true ]] && systemctl --no-pager --full status altiair-camera-adapter.service || true
[[ "$want_rfid" == true ]] && systemctl --no-pager --full status altiair-rfid-adapter.service || true
if [[ "$want_camera" != true && "$want_rfid" != true ]]; then
  echo "No adapter selected. Set ALTIAIR_SENSOR_ADAPTERS=camera, rfid, or camera,rfid."
fi

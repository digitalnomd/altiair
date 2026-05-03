#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
NODE_ID="altiair-node-a"
API_PORT="8081"
LAN_ADDRESS="192.168.42.11/24"
LAN_GATEWAY="192.168.42.20"
USB_ADDRESS="192.168.66.2/24"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/install-lite-api-sd.sh \
    --boot /Volumes/bootfs \
    --node-id altiair-node-a \
    --api-port 8081 \
    --lan-address 192.168.42.11/24

Writes a one-shot boot installer to a mounted Raspberry Pi boot partition. On
the next boot the Pi installs a minimal Altiair-compatible API service using
Python 3, enables SSH, keeps USB gadget fallback configured, and removes the
one-shot hook from cmdline.txt.
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "Missing value for $flag" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --boot)
      require_value "$1" "${2:-}"
      BOOT_DIR="$2"
      shift 2
      ;;
    --node-id)
      require_value "$1" "${2:-}"
      NODE_ID="$2"
      shift 2
      ;;
    --api-port)
      require_value "$1" "${2:-}"
      API_PORT="$2"
      shift 2
      ;;
    --lan-address)
      require_value "$1" "${2:-}"
      LAN_ADDRESS="$2"
      shift 2
      ;;
    --lan-gateway)
      require_value "$1" "${2:-}"
      LAN_GATEWAY="$2"
      shift 2
      ;;
    --usb-address)
      require_value "$1" "${2:-}"
      USB_ADDRESS="$2"
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

if [[ ! -d "$BOOT_DIR" ]]; then
  echo "Boot partition not found: $BOOT_DIR" >&2
  exit 1
fi

cmdline="$BOOT_DIR/cmdline.txt"
config="$BOOT_DIR/config.txt"
firstrun="$BOOT_DIR/firstrun.sh"
installer="$BOOT_DIR/altiair-lite-api-install.sh"

if [[ ! -f "$cmdline" || ! -f "$config" ]]; then
  echo "Expected cmdline.txt and config.txt under $BOOT_DIR" >&2
  exit 1
fi

if [[ "$NODE_ID$API_PORT$LAN_ADDRESS$LAN_GATEWAY$USB_ADDRESS" == *$'\n'* ]]; then
  echo "Values must not contain newlines." >&2
  exit 2
fi

if ! grep -q 'modules-load=dwc2,g_ether' "$cmdline"; then
  tmp_cmdline="$(mktemp)"
  tr -d '\n' < "$cmdline" > "$tmp_cmdline"
  perl -0pi -e 's/\bmodules-load=[^ ]* *//g' "$tmp_cmdline"
  perl -0pi -e 's/(rootwait\b)/$1 modules-load=dwc2,g_ether/' "$tmp_cmdline"
  printf '\n' >> "$tmp_cmdline"
  mv "$tmp_cmdline" "$cmdline"
fi

if ! grep -Eq '^dtoverlay=dwc2,dr_mode=peripheral$' "$config"; then
  printf '\n[all]\ndtoverlay=dwc2,dr_mode=peripheral\n' >> "$config"
fi

cat > "$installer" <<'EOF'
#!/bin/bash
set +e

NODE_ID='__NODE_ID__'
API_PORT='__API_PORT__'
LAN_ADDRESS='__LAN_ADDRESS__'
LAN_GATEWAY='__LAN_GATEWAY__'
USB_ADDRESS='__USB_ADDRESS__'
LOG=/boot/firmware/altiair-lite-api-install.log

{
  echo "install start $(date -Iseconds)"
  hostname

  systemctl enable ssh || systemctl enable ssh.service || true
  systemctl start ssh || systemctl start ssh.service || true

  if command -v nmcli >/dev/null 2>&1; then
    nmcli connection modify altiair-lan \
      connection.autoconnect yes \
      connection.autoconnect-priority 100 \
      ipv4.method manual \
      ipv4.addresses "$LAN_ADDRESS" \
      ipv4.gateway "$LAN_GATEWAY" \
      ipv4.dns "$LAN_GATEWAY" \
      ipv6.method disabled >/dev/null 2>&1 || true
    nmcli connection up altiair-lan ifname wlan0 >/dev/null 2>&1 || true

    nmcli con delete altiair-usb-gadget >/dev/null 2>&1 || true
    nmcli con add type ethernet ifname usb0 con-name altiair-usb-gadget \
      ipv4.method manual ipv4.addresses "$USB_ADDRESS" \
      ipv6.method link-local connection.autoconnect yes >/dev/null 2>&1 || true
    nmcli con up altiair-usb-gadget >/dev/null 2>&1 || true
  fi

  if [ -d /sys/class/net/usb0 ]; then
    ip addr replace "$USB_ADDRESS" dev usb0 >/dev/null 2>&1 || true
    ip link set usb0 up || true
  fi

  install -d -m 0755 /opt/altiair /etc/altiair

  cat > /etc/altiair/altiair-node.env <<ENV_EOF
ALTIAIR_NODE_ID=$NODE_ID
ALTIAIR_API_HOST=0.0.0.0
ALTIAIR_API_PORT=$API_PORT
ALTIAIR_MISSION_ID=mission-live-edge
ALTIAIR_OPERATOR_AUTHORIZED=false
LOCAL_LLM_MODE=mock
LOCAL_LLM_MODEL=gemma3:1b
FOUNDRY_MODE=mock
ENV_EOF
  chmod 600 /etc/altiair/altiair-node.env

  cat > /opt/altiair/node-api-lite.py <<'PY_EOF'
#!/usr/bin/env python3
import json
import os
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

NODE_ID = os.environ.get("ALTIAIR_NODE_ID", "altiair-node-a")
HOST = os.environ.get("ALTIAIR_API_HOST", "0.0.0.0")
PORT = int(os.environ.get("ALTIAIR_API_PORT", "8081"))
STARTED_AT = time.time()

TOPOLOGY = {
    "missionNetworkId": "altiair-ddil-demo-net",
    "defaultApSsid": "Altiair-LAN",
    "defaultLanCidr": "192.168.42.0/24",
    "defaultGatewayAddress": "192.168.42.20",
    "nodes": [
        {"id": "altiair-orin", "hostname": "altiair-orin", "platform": "jetson_orin_nano", "lanAddress": "192.168.42.20", "apiPort": 8080, "roles": ["mission_lan_host", "accelerated_inference", "foundry_gateway"]},
        {"id": "altiair-node-a", "hostname": "altiair-node-a", "platform": "raspberry_pi_4b", "lanAddress": "192.168.42.11", "apiPort": 8081, "roles": ["edge_sensor"]},
        {"id": "altiair-node-b", "hostname": "altiair-node-b", "platform": "raspberry_pi_4b", "lanAddress": "192.168.42.12", "apiPort": 8082, "roles": ["edge_sensor"]},
        {"id": "altiair-hub", "hostname": "altiair-hub", "platform": "raspberry_pi_5", "lanAddress": "192.168.42.10", "apiPort": 8080, "roles": ["mission_lan_host", "mesh_hub", "operator_display", "foundry_gateway"]},
    ],
}

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def health():
    return {
        "nodeId": NODE_ID,
        "nodeRole": "raspberry_pi_edge_sensor",
        "observedAt": now_iso(),
        "peerCount": 3,
        "queueDepth": 0,
        "cpuLoad": 0,
        "memoryUsedMb": None,
        "networkReachable": True,
        "foundryReachable": False,
        "modelStatus": "mock",
        "uptimeSeconds": round(time.time() - STARTED_AT, 3),
    }

class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, indent=2).encode("utf-8") + b"\n"
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.client_address[0], fmt % args), flush=True)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type,authorization")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/health":
            self._send(200, health())
        elif path == "/topology":
            self._send(200, TOPOLOGY)
        elif path == "/peers":
            self._send(200, {"nodeId": NODE_ID, "peers": [n for n in TOPOLOGY["nodes"] if n["id"] != NODE_ID]})
        elif path == "/dashboard":
            self._send(200, {"health": health(), "topology": TOPOLOGY, "mode": "lite-pi-service"})
        else:
            self._send(404, {"error": "not_found", "path": self.path})

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        length = int(self.headers.get("content-length", "0") or "0")
        if length:
            self.rfile.read(length)
        if path == "/sensor-events":
            self._send(202, {"accepted": True, "nodeId": NODE_ID, "observedAt": now_iso(), "mode": "lite-pi-service"})
        else:
            self._send(404, {"error": "not_found", "path": self.path})

if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(json.dumps({"nodeId": NODE_ID, "listen": f"{HOST}:{PORT}", "mode": "lite-pi-service"}), flush=True)
    server.serve_forever()
PY_EOF
  chmod 755 /opt/altiair/node-api-lite.py

  cat > /etc/systemd/system/altiair-node.service <<SERVICE_EOF
[Unit]
Description=Altiair CASK edge node API lite
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=-/etc/altiair/altiair-node.env
ExecStart=/usr/bin/python3 /opt/altiair/node-api-lite.py
Restart=always
RestartSec=3
User=altiair

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  systemctl daemon-reload || true
  systemctl enable --now altiair-node || true
  systemctl restart altiair-node || true
  sleep 2

  ip -br addr || true
  systemctl --no-pager --full status altiair-node | sed -n '1,100p' || true
  curl -fsS "http://127.0.0.1:${API_PORT}/health" || true
  echo
  echo "install end $(date -Iseconds)"
} >> "$LOG" 2>&1

rm -f /boot/firmware/altiair-lite-api-install.sh /boot/altiair-lite-api-install.sh
exit 0
EOF

perl -0pi \
  -e "s/__NODE_ID__/$NODE_ID/g" \
  -e "s/__API_PORT__/$API_PORT/g" \
  -e "s|__LAN_ADDRESS__|$LAN_ADDRESS|g" \
  -e "s|__LAN_GATEWAY__|$LAN_GATEWAY|g" \
  -e "s|__USB_ADDRESS__|$USB_ADDRESS|g" \
  "$installer"
chmod +x "$installer"

cat > "$firstrun" <<'EOF'
#!/bin/bash
set +e
if [ -x /boot/firmware/altiair-lite-api-install.sh ]; then /boot/firmware/altiair-lite-api-install.sh || true; elif [ -x /boot/altiair-lite-api-install.sh ]; then /boot/altiair-lite-api-install.sh || true; fi
rm -f /boot/firstrun.sh /boot/firmware/firstrun.sh
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
exit 0
EOF
chmod +x "$firstrun"

if [[ -f "$BOOT_DIR/issue.txt" ]] && grep -Eq 'Raspberry Pi reference 202[3-9]|Debian GNU/Linux (12|13|14|15)' "$BOOT_DIR/issue.txt"; then
  firstrun_target="/boot/firmware/firstrun.sh"
else
  firstrun_target="/boot/firstrun.sh"
fi

tmp_cmdline="$(mktemp)"
tr -d '\n' < "$cmdline" |
  sed -E 's| systemd\.run=[^ ]*||g; s| systemd\.run_success_action=[^ ]*||g; s| systemd\.unit=kernel-command-line.target||g' \
  > "$tmp_cmdline"
printf ' systemd.run=%s systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' "$firstrun_target" >> "$tmp_cmdline"
mv "$tmp_cmdline" "$cmdline"

printf 'Prepared %s to self-install %s lite API on port %s at next boot.\n' "$BOOT_DIR" "$NODE_ID" "$API_PORT"

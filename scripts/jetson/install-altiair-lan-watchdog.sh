#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${ALTIAIR_APP_DIR:-/opt/altiair}"
SOURCE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
HEALTHCHECK="${SOURCE_DIR}/altiair-lan-healthcheck.sh"

if [[ ! -f "$HEALTHCHECK" ]]; then
  echo "Healthcheck not found: ${HEALTHCHECK}" >&2
  exit 1
fi

sudo install -d -m 0755 "$APP_DIR"
sudo install -m 0755 "$HEALTHCHECK" "$APP_DIR/altiair-lan-healthcheck.sh"

sudo tee /usr/local/sbin/altiair-lan-watchdog.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set +e

LOG=/var/log/altiair-lan-watchdog.log
CON_NAME="${ALTIAIR_AP_CONNECTION:-altiair-lan}"

{
  echo "watchdog start $(date -Iseconds)"
  if command -v nmcli >/dev/null 2>&1; then
    nmcli -t -f NAME,DEVICE connection show --active | grep -q "^${CON_NAME}:" ||
      nmcli connection up "$CON_NAME" || true
  fi
  systemctl is-active --quiet altiair-node || systemctl restart altiair-node || true
  /opt/altiair/altiair-lan-healthcheck.sh || true
  echo "watchdog end $(date -Iseconds)"
} >> "$LOG" 2>&1
EOF
sudo chmod 0755 /usr/local/sbin/altiair-lan-watchdog.sh

sudo tee /etc/systemd/system/altiair-lan-watchdog.service >/dev/null <<'EOF'
[Unit]
Description=Altiair LAN watchdog
After=NetworkManager.service altiair-node.service
Wants=NetworkManager.service altiair-node.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/altiair-lan-watchdog.sh
EOF

sudo tee /etc/systemd/system/altiair-lan-watchdog.timer >/dev/null <<'EOF'
[Unit]
Description=Run Altiair LAN watchdog

[Timer]
OnBootSec=30
OnUnitActiveSec=30
AccuracySec=5
Unit=altiair-lan-watchdog.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now altiair-lan-watchdog.timer
systemctl --no-pager --full status altiair-lan-watchdog.timer || true

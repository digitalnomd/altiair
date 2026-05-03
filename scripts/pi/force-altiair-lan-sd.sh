#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
HOSTNAME="altiair-node-a"
WIFI_SSID="Altiair-LAN"
WIFI_PASSWORD="${ALTIAIR_WIFI_PASSWORD:-}"
WIFI_COUNTRY="US"
WIFI_ADDRESS="192.168.42.11/24"
WIFI_GATEWAY="192.168.42.20"
WIFI_DNS="192.168.42.20"

usage() {
  cat <<'EOF'
Usage:
  ALTIAIR_WIFI_PASSWORD='<ap-password>' scripts/pi/force-altiair-lan-sd.sh \
    --boot /Volumes/bootfs \
    --hostname altiair-node-a \
    --wifi-address 192.168.42.11/24

Writes a one-shot boot repair to a mounted Raspberry Pi boot partition. On the
next Pi boot it removes stale Wi-Fi profiles, installs an Altiair-LAN
NetworkManager profile, enables SSH, refreshes the USB gadget fallback, and
then removes the one-shot hook from cmdline.txt.
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
    --hostname)
      require_value "$1" "${2:-}"
      HOSTNAME="$2"
      shift 2
      ;;
    --wifi-ssid)
      require_value "$1" "${2:-}"
      WIFI_SSID="$2"
      shift 2
      ;;
    --wifi-password)
      require_value "$1" "${2:-}"
      WIFI_PASSWORD="$2"
      shift 2
      ;;
    --wifi-country)
      require_value "$1" "${2:-}"
      WIFI_COUNTRY="$2"
      shift 2
      ;;
    --wifi-address)
      require_value "$1" "${2:-}"
      WIFI_ADDRESS="$2"
      shift 2
      ;;
    --wifi-gateway)
      require_value "$1" "${2:-}"
      WIFI_GATEWAY="$2"
      shift 2
      ;;
    --wifi-dns)
      require_value "$1" "${2:-}"
      WIFI_DNS="$2"
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

config="$BOOT_DIR/config.txt"
cmdline="$BOOT_DIR/cmdline.txt"
firstrun="$BOOT_DIR/firstrun.sh"
repair="$BOOT_DIR/altiair-lan-repair.sh"

if [[ ! -f "$config" || ! -f "$cmdline" ]]; then
  echo "Expected config.txt and cmdline.txt under $BOOT_DIR" >&2
  exit 1
fi

if [[ -z "$WIFI_PASSWORD" && -f "$BOOT_DIR/network-config" ]]; then
  WIFI_PASSWORD="$(
    awk -v ssid="$WIFI_SSID" '
      $0 ~ "^[[:space:]]*'\''" ssid "'\'':[[:space:]]*$" { in_ap = 1; next }
      in_ap && /^[[:space:]]*password:[[:space:]]*/ {
        sub(/^[[:space:]]*password:[[:space:]]*/, "")
        sub(/^'\''/, "")
        sub(/'\''[[:space:]]*$/, "")
        gsub(/'\'''\''/, "'\''")
        print
        exit
      }
    ' "$BOOT_DIR/network-config"
  )"
fi

if [[ -z "$WIFI_PASSWORD" ]]; then
  echo "ALTIAIR_WIFI_PASSWORD or --wifi-password is required." >&2
  exit 2
fi

if [[ "$HOSTNAME$WIFI_SSID$WIFI_PASSWORD$WIFI_COUNTRY$WIFI_ADDRESS$WIFI_GATEWAY$WIFI_DNS" == *$'\n'* ]]; then
  echo "Values must not contain newlines." >&2
  exit 2
fi

psk_b64="$(printf '%s' "$WIFI_PASSWORD" | base64 | tr -d '\n')"

if ! grep -q 'modules-load=dwc2,g_ether' "$cmdline"; then
  tmp_cmdline="$(mktemp)"
  tr -d '\n' < "$cmdline" > "$tmp_cmdline"
  perl -0pi -e 's/\bmodules-load=[^ ]* *//g' "$tmp_cmdline"
  perl -0pi -e 's/(rootwait\b)/$1 modules-load=dwc2,g_ether/' "$tmp_cmdline"
  printf '\n' >> "$tmp_cmdline"
  mv "$tmp_cmdline" "$cmdline"
fi

if grep -Eq '^dtoverlay=dwc2$' "$config"; then
  tmp_config="$(mktemp)"
  awk '
    /^\[cm5\]$/ { section = "cm5"; print; next }
    /^\[/ { section = ""; print; next }
    section != "cm5" && /^dtoverlay=dwc2$/ {
      print "dtoverlay=dwc2,dr_mode=peripheral"
      next
    }
    { print }
  ' "$config" > "$tmp_config"
  mv "$tmp_config" "$config"
fi

if ! grep -Eq '^dtoverlay=dwc2,dr_mode=peripheral$' "$config"; then
  printf '\n[all]\ndtoverlay=dwc2,dr_mode=peripheral\n' >> "$config"
fi

cat > "$repair" <<EOF
#!/bin/bash
set +e

HOSTNAME='$HOSTNAME'
WIFI_SSID='$WIFI_SSID'
WIFI_COUNTRY='$WIFI_COUNTRY'
WIFI_ADDRESS='$WIFI_ADDRESS'
WIFI_GATEWAY='$WIFI_GATEWAY'
WIFI_DNS='$WIFI_DNS'
WIFI_PSK_B64='$psk_b64'
LOG=/boot/firmware/altiair-lan-repair.log

decode_psk() {
  printf '%s' "\$WIFI_PSK_B64" | base64 -d 2>/dev/null || printf '%s' "\$WIFI_PSK_B64" | base64 --decode 2>/dev/null
}

install_runtime() {
  cat > /usr/local/sbin/altiair-lan-repair-runtime.sh <<'RUNTIME_EOF'
#!/bin/bash
set +e

LOG=/boot/firmware/altiair-lan-repair.log
WIFI_SSID='__ALTIAIR_WIFI_SSID__'
WIFI_COUNTRY='__ALTIAIR_WIFI_COUNTRY__'
WIFI_ADDRESS='__ALTIAIR_WIFI_ADDRESS__'
WIFI_GATEWAY='__ALTIAIR_WIFI_GATEWAY__'
WIFI_DNS='__ALTIAIR_WIFI_DNS__'
WIFI_PSK_B64='__ALTIAIR_WIFI_PSK_B64__'

decode_psk() {
  printf '%s' "\$WIFI_PSK_B64" | base64 -d 2>/dev/null || printf '%s' "\$WIFI_PSK_B64" | base64 --decode 2>/dev/null
}

{
  echo "runtime start \$(date -Iseconds)"
  psk="\$(decode_psk)"
  rfkill unblock wifi 2>/dev/null || true
  raspi-config nonint do_wifi_country "\$WIFI_COUNTRY" 2>/dev/null || true
  iw reg set "\$WIFI_COUNTRY" 2>/dev/null || true
  systemctl enable ssh || systemctl enable ssh.service || true
  systemctl start ssh || systemctl start ssh.service || true

  if command -v nmcli >/dev/null 2>&1; then
    nmcli radio wifi on || true
    nmcli -t -f NAME,TYPE connection show | awk -F: '\$2 == "802-11-wireless" || \$2 == "wifi" { print \$1 }' |
      while IFS= read -r con; do
        [ "\$con" = "altiair-lan" ] || nmcli connection delete "\$con" >/dev/null 2>&1 || true
      done
    nmcli connection show altiair-lan >/dev/null 2>&1 ||
      nmcli connection add type wifi ifname wlan0 con-name altiair-lan ssid "\$WIFI_SSID" >/dev/null 2>&1 || true
    nmcli -t -f NAME,TYPE connection show | awk -F: '\$2 == "802-11-wireless" || \$2 == "wifi" { print \$1 }' |
      while IFS= read -r con; do
        [ "\$con" = "altiair-lan" ] || nmcli connection delete "\$con" >/dev/null 2>&1 || true
      done
    nmcli connection modify altiair-lan \
      connection.autoconnect yes \
      connection.autoconnect-priority 100 \
      802-11-wireless.mode infrastructure \
      802-11-wireless.ssid "\$WIFI_SSID" \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "\$psk" \
      ipv4.method manual \
      ipv4.addresses "\$WIFI_ADDRESS" \
      ipv4.gateway "\$WIFI_GATEWAY" \
      ipv4.dns "\$WIFI_DNS" \
      ipv6.method disabled >/dev/null 2>&1 || true
    nmcli connection up altiair-lan ifname wlan0 >/dev/null 2>&1 || true
  fi

  ip -br addr
  ip route
  command -v nmcli >/dev/null 2>&1 && nmcli -f NAME,TYPE,DEVICE,STATE connection show --active || true
  iw dev wlan0 link 2>/dev/null || true
  echo "runtime end \$(date -Iseconds)"
} >> "\$LOG" 2>&1
RUNTIME_EOF

  sed -i \\
    -e "s|__ALTIAIR_WIFI_SSID__|\$WIFI_SSID|g" \\
    -e "s|__ALTIAIR_WIFI_COUNTRY__|\$WIFI_COUNTRY|g" \\
    -e "s|__ALTIAIR_WIFI_ADDRESS__|\$WIFI_ADDRESS|g" \\
    -e "s|__ALTIAIR_WIFI_GATEWAY__|\$WIFI_GATEWAY|g" \\
    -e "s|__ALTIAIR_WIFI_DNS__|\$WIFI_DNS|g" \\
    -e "s|__ALTIAIR_WIFI_PSK_B64__|\$WIFI_PSK_B64|g" \\
    /usr/local/sbin/altiair-lan-repair-runtime.sh
  chmod +x /usr/local/sbin/altiair-lan-repair-runtime.sh

  cat > /etc/systemd/system/altiair-lan-repair.service <<'SERVICE_EOF'
[Unit]
Description=Altiair LAN Wi-Fi repair
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/altiair-lan-repair-runtime.sh

[Install]
WantedBy=multi-user.target
SERVICE_EOF

  cat > /etc/systemd/system/altiair-lan-repair.timer <<'TIMER_EOF'
[Unit]
Description=Retry Altiair LAN Wi-Fi repair

[Timer]
OnBootSec=45
OnUnitActiveSec=60
AccuracySec=10
Unit=altiair-lan-repair.service

[Install]
WantedBy=timers.target
TIMER_EOF

  systemctl daemon-reload || true
  systemctl enable altiair-lan-repair.service || true
  systemctl enable --now altiair-lan-repair.timer || true
}

configure_nm() {
  local psk
  psk="\$(decode_psk)"

  if command -v nmcli >/dev/null 2>&1; then
    nmcli radio wifi on || true
    nmcli -t -f NAME,TYPE connection show | awk -F: '\$2 == "802-11-wireless" || \$2 == "wifi" { print \$1 }' |
      while IFS= read -r con; do
        nmcli connection delete "\$con" >/dev/null 2>&1 || true
      done
    nmcli connection add type wifi ifname wlan0 con-name altiair-lan ssid "\$WIFI_SSID" >/dev/null 2>&1 || true
    nmcli connection modify altiair-lan \\
      connection.autoconnect yes \\
      connection.autoconnect-priority 100 \\
      802-11-wireless.mode infrastructure \\
      802-11-wireless.ssid "\$WIFI_SSID" \\
      wifi-sec.key-mgmt wpa-psk \\
      wifi-sec.psk "\$psk" \\
      ipv4.method manual \\
      ipv4.addresses "\$WIFI_ADDRESS" \\
      ipv4.gateway "\$WIFI_GATEWAY" \\
      ipv4.dns "\$WIFI_DNS" \\
      ipv6.method disabled >/dev/null 2>&1 || true
    nmcli device disconnect wlan0 >/dev/null 2>&1 || true
    sleep 2
    nmcli connection up altiair-lan ifname wlan0 >/dev/null 2>&1 || true
  fi
}

{
  echo "repair start \$(date -Iseconds)"
  hostnamectl set-hostname "\$HOSTNAME" || true
  rfkill unblock wifi 2>/dev/null || true
  raspi-config nonint do_wifi_country "\$WIFI_COUNTRY" 2>/dev/null || true
  iw reg set "\$WIFI_COUNTRY" 2>/dev/null || true
  systemctl enable ssh || systemctl enable ssh.service || true
  systemctl start ssh || systemctl start ssh.service || true
  install_runtime
  configure_nm
  ip -br addr
  ip route
  command -v nmcli >/dev/null 2>&1 && nmcli -f NAME,TYPE,DEVICE,STATE connection show --active || true
  iw dev wlan0 link 2>/dev/null || true
  echo "repair end \$(date -Iseconds)"
} >> "\$LOG" 2>&1

rm -f /boot/firmware/altiair-lan-repair.sh /boot/altiair-lan-repair.sh
systemctl start altiair-lan-repair.service || true
systemctl start altiair-lan-repair.timer || true
exit 0
EOF
chmod +x "$repair"

cat > "$firstrun" <<'EOF'
#!/bin/bash
set +e
if [ -x /boot/firmware/altiair-usb-gadget.sh ]; then /boot/firmware/altiair-usb-gadget.sh || true; elif [ -x /boot/altiair-usb-gadget.sh ]; then /boot/altiair-usb-gadget.sh || true; fi
if [ -x /boot/firmware/altiair-lan-repair.sh ]; then /boot/firmware/altiair-lan-repair.sh || true; elif [ -x /boot/altiair-lan-repair.sh ]; then /boot/altiair-lan-repair.sh || true; fi
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

if [[ -f "$BOOT_DIR/meta-data" ]]; then
  {
    printf "instance-id: '%s-lan-repair-%s'\n" "$HOSTNAME" "$(date +%s)"
    printf "local-hostname: '%s'\n" "$HOSTNAME"
  } > "$BOOT_DIR/meta-data"
fi

printf 'Prepared %s to force %s onto %s at %s\n' "$BOOT_DIR" "$HOSTNAME" "$WIFI_SSID" "$WIFI_ADDRESS"

#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
PI_ADDRESS="192.168.66.2/24"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/enable-usb-gadget-sd.sh [--boot /Volumes/bootfs] [--pi-address 192.168.66.2/24]

Enables Raspberry Pi USB-C gadget networking on a mounted boot partition and
adds a one-shot first-boot script that gives usb0 a static address. This is a
diagnostic fallback for Pi 4-class boards when Wi-Fi first boot is not reachable.
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
    --pi-address)
      require_value "$1" "${2:-}"
      PI_ADDRESS="$2"
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
gadget="$BOOT_DIR/altiair-usb-gadget.sh"

if [[ ! -f "$config" || ! -f "$cmdline" ]]; then
  echo "Expected config.txt and cmdline.txt under $BOOT_DIR" >&2
  exit 1
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

if ! grep -q 'modules-load=dwc2,g_ether' "$cmdline"; then
  tmp_cmdline="$(mktemp)"
  tr -d '\n' < "$cmdline" > "$tmp_cmdline"
  perl -0pi -e 's/\bmodules-load=[^ ]* *//g' "$tmp_cmdline"
  perl -0pi -e 's/(rootwait\b)/$1 modules-load=dwc2,g_ether/' "$tmp_cmdline"
  printf '\n' >> "$tmp_cmdline"
  mv "$tmp_cmdline" "$cmdline"
fi

cat > "$gadget" <<EOF
#!/bin/bash
set +e

PI_ADDRESS='$PI_ADDRESS'

cat > /usr/local/sbin/altiair-usb-gadget-runtime.sh <<'RUNTIME_EOF'
#!/bin/bash
set +e

PI_ADDRESS='$PI_ADDRESS'
LOG=/boot/firmware/altiair-usb-gadget.log

{
  echo "runtime start \$(date -Iseconds)"
  hostname
  for _ in \$(seq 1 60); do
    [ -d /sys/class/net/usb0 ] && break
    sleep 1
  done

  modprobe dwc2 2>/dev/null || true
  modprobe g_ether 2>/dev/null || true

  if [ -d /sys/class/net/usb0 ]; then
    ip link set usb0 up || true

    if command -v nmcli >/dev/null 2>&1; then
      nmcli con delete altiair-usb-gadget >/dev/null 2>&1 || true
      nmcli con add type ethernet ifname usb0 con-name altiair-usb-gadget \
        ipv4.method manual ipv4.addresses "\$PI_ADDRESS" \
        ipv6.method link-local connection.autoconnect yes >/dev/null 2>&1 || true
      nmcli con modify altiair-usb-gadget connection.autoconnect yes >/dev/null 2>&1 || true
      nmcli con up altiair-usb-gadget >/dev/null 2>&1 || true
    fi

    ip addr replace "\$PI_ADDRESS" dev usb0 >/dev/null 2>&1 || true
    ip link set usb0 up || true
  else
    echo "usb0 not present after wait"
  fi

  systemctl enable ssh || systemctl enable ssh.service || true
  systemctl start ssh || systemctl start ssh.service || true

  ip -br addr
  ip route
  systemctl is-active ssh ssh.service 2>/dev/null || true
  echo "runtime end \$(date -Iseconds)"
} >> "\$LOG" 2>&1
RUNTIME_EOF
chmod +x /usr/local/sbin/altiair-usb-gadget-runtime.sh

cat > /etc/systemd/system/altiair-usb-gadget.service <<'SERVICE_EOF'
[Unit]
Description=Altiair Raspberry Pi USB gadget network fallback
After=systemd-modules-load.service NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/altiair-usb-gadget-runtime.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload || true
systemctl enable altiair-usb-gadget.service || true

systemctl enable ssh || systemctl enable ssh.service || true
systemctl start ssh || systemctl start ssh.service || true

ip link set usb0 up || true

if command -v nmcli >/dev/null 2>&1; then
  nmcli con delete altiair-usb-gadget >/dev/null 2>&1 || true
  nmcli con add type ethernet ifname usb0 con-name altiair-usb-gadget \
    ipv4.method manual ipv4.addresses "\$PI_ADDRESS" \
    ipv6.method link-local connection.autoconnect yes >/dev/null 2>&1 || true
  nmcli con up altiair-usb-gadget >/dev/null 2>&1 || true
fi

if ! ip -4 addr show usb0 | grep -q '192\.168\.66\.'; then
  ip addr add "\$PI_ADDRESS" dev usb0 >/dev/null 2>&1 || true
  ip link set usb0 up || true
fi

{
  date -Iseconds
  hostname
  echo "first-run install"
  ip -br addr
  ip route
  systemctl is-active ssh ssh.service 2>/dev/null || true
} >/boot/firmware/altiair-usb-gadget.log 2>&1 || true

systemctl start altiair-usb-gadget.service || true
EOF
chmod +x "$gadget"

gadget_hook='if [ -x /boot/firmware/altiair-usb-gadget.sh ]; then /boot/firmware/altiair-usb-gadget.sh || true; elif [ -x /boot/altiair-usb-gadget.sh ]; then /boot/altiair-usb-gadget.sh || true; fi'

if [[ -f "$firstrun" ]]; then
  if ! grep -q 'altiair-usb-gadget.sh' "$firstrun"; then
    tmp_firstrun="$(mktemp)"
    awk -v hook="$gadget_hook" '
      /rm -f \/boot\/firstrun\.sh \/boot\/firmware\/firstrun\.sh/ && !done {
        print hook
        done=1
      }
      { print }
      END {
        if (!done) {
          print hook
        }
      }
    ' "$firstrun" > "$tmp_firstrun"
    mv "$tmp_firstrun" "$firstrun"
    chmod +x "$firstrun"
  fi
else
  cat > "$firstrun" <<EOF
#!/bin/bash
set +e
$gadget_hook
rm -f /boot/firstrun.sh /boot/firmware/firstrun.sh
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
exit 0
EOF
  chmod +x "$firstrun"
fi

if [[ -f "$BOOT_DIR/issue.txt" ]] && grep -Eq 'Raspberry Pi reference 202[3-9]|Debian GNU/Linux (12|13|14|15)' "$BOOT_DIR/issue.txt"; then
  firstrun_target="/boot/firmware/firstrun.sh"
else
  firstrun_target="/boot/firstrun.sh"
fi

tmp_cmdline="$(mktemp)"
tr -d '\n' < "$cmdline" \
  | sed -E 's| systemd\.run=[^ ]*||g; s| systemd\.run_success_action=[^ ]*||g; s| systemd\.unit=kernel-command-line.target||g' \
  > "$tmp_cmdline"
printf ' systemd.run=%s systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' "$firstrun_target" >> "$tmp_cmdline"
mv "$tmp_cmdline" "$cmdline"

printf 'Enabled Pi USB gadget fallback on %s with Pi address %s\n' "$BOOT_DIR" "$PI_ADDRESS"

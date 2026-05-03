#!/usr/bin/env bash
set -euo pipefail

# macOS-side helper. Restore the USB route, then set the Jetson clock from the
# Mac clock. This stores no passwords and may prompt for both Mac admin and the
# Jetson user's sudo password.

SERVICE="${ALTIAIR_JETSON_SERVICE:-Linux for Tegra}"
IFACE="${ALTIAIR_JETSON_IFACE:-}"
MAC_IP="${ALTIAIR_MAC_USB_IP:-192.168.55.100}"
NETMASK="${ALTIAIR_MAC_USB_NETMASK:-255.255.255.0}"
NETWORK="${ALTIAIR_JETSON_USB_NETWORK:-192.168.55.0/24}"
JETSON_IP="${ALTIAIR_JETSON_IP:-192.168.55.1}"
JETSON_MAC="${ALTIAIR_JETSON_MAC:-3e:c7:e7:79:f3:87}"
JETSON_USER="${ALTIAIR_JETSON_USER:-altiair}"
KNOWN_HOSTS="${ALTIAIR_JETSON_KNOWN_HOSTS:-/tmp/altiair-jetson-known-hosts}"
TIMEZONE="${ALTIAIR_JETSON_TIMEZONE:-America/Los_Angeles}"
EPOCH="${1:-$(date -u +%s)}"

if [[ "$OSTYPE" != darwin* ]]; then
  echo "This helper is for the macOS side of the Jetson USB-C link." >&2
  exit 2
fi

detect_iface() {
  /usr/sbin/networksetup -listallhardwareports |
    awk -v service="$SERVICE" '
      $0 == "Hardware Port: " service {
        getline
        sub(/^Device: /, "")
        print
        exit
      }
    '
}

if [[ -z "$IFACE" ]]; then
  IFACE="$(detect_iface)"
fi

if [[ -z "$IFACE" ]]; then
  echo "Network service '${SERVICE}' is not present. Is the Jetson connected over USB-C and booted?" >&2
  exit 1
fi

case "$EPOCH" in
  ''|*[!0-9]*)
    echo "Epoch must be numeric seconds since 1970; received '${EPOCH}'." >&2
    exit 2
    ;;
esac

echo "Configuring ${SERVICE} (${IFACE}) as ${MAC_IP}/24 -> ${JETSON_IP}" >&2
sudo /usr/sbin/networksetup -setmanual "$SERVICE" "$MAC_IP" "$NETMASK" >/dev/null 2>&1 || true
sudo /sbin/ifconfig "$IFACE" inet "$MAC_IP" netmask "$NETMASK" up
sudo /sbin/route -n delete "$JETSON_IP" >/dev/null 2>&1 || true
sudo /sbin/route -n delete -net "$NETWORK" >/dev/null 2>&1 || true
sudo /usr/sbin/arp -d "$JETSON_IP" >/dev/null 2>&1 || true
sudo /sbin/route -n add -net "$NETWORK" -interface "$IFACE" >/dev/null 2>&1 || true
sudo /usr/sbin/arp -s "$JETSON_IP" "$JETSON_MAC" ifscope "$IFACE"
sudo /sbin/ping -S "$MAC_IP" -c 1 -W 1000 "$JETSON_IP" >/dev/null

echo "Syncing Jetson clock to $(date -r "$EPOCH" -u '+%Y-%m-%dT%H:%M:%SZ')" >&2
exec sudo /usr/bin/ssh \
  -tt \
  -b "$MAC_IP" \
  -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=10 \
  "${JETSON_USER}@${JETSON_IP}" \
  "sudo /bin/bash -lc 'timedatectl set-timezone ${TIMEZONE} || true; date -u -s @${EPOCH}; hwclock --systohc || true; echo SYSTEM_TIME; date -Is; echo UTC_TIME; date -u -Is; echo API_HEALTH; curl -sS http://127.0.0.1:8080/health'"

#!/usr/bin/env bash
set -euo pipefail

# Restore the macOS USB-C route to the Jetson L4T gadget, then SSH in.
# Defaults match the prepared Altiair Jetson Orin Nano image.

SERVICE="${ALTIAIR_JETSON_SERVICE:-Linux for Tegra}"
IFACE="${ALTIAIR_JETSON_IFACE:-}"
MAC_IP="${ALTIAIR_MAC_USB_IP:-192.168.55.100}"
NETMASK="${ALTIAIR_MAC_USB_NETMASK:-255.255.255.0}"
NETWORK="${ALTIAIR_JETSON_USB_NETWORK:-192.168.55.0/24}"
JETSON_IP="${ALTIAIR_JETSON_IP:-192.168.55.1}"
JETSON_MAC="${ALTIAIR_JETSON_MAC:-3e:c7:e7:79:f3:87}"
JETSON_USER="${ALTIAIR_JETSON_USER:-altiair}"
KNOWN_HOSTS="${ALTIAIR_JETSON_KNOWN_HOSTS:-/tmp/altiair-jetson-known-hosts}"

mode="ssh"
if [[ "${1:-}" == "--setup-only" ]]; then
  mode="setup-only"
  shift
fi

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

echo "Configuring ${SERVICE} (${IFACE}) as ${MAC_IP}/24 -> ${JETSON_IP}" >&2
sudo /usr/sbin/networksetup -setmanual "$SERVICE" "$MAC_IP" "$NETMASK" >/dev/null 2>&1 || true
sudo /sbin/ifconfig "$IFACE" inet "$MAC_IP" netmask "$NETMASK" up
sudo /sbin/route -n delete "$JETSON_IP" >/dev/null 2>&1 || true
sudo /sbin/route -n delete -net "$NETWORK" >/dev/null 2>&1 || true
sudo /usr/sbin/arp -d "$JETSON_IP" >/dev/null 2>&1 || true
sudo /sbin/route -n add -net "$NETWORK" -interface "$IFACE" >/dev/null 2>&1 || true
sudo /usr/sbin/arp -s "$JETSON_IP" "$JETSON_MAC" ifscope "$IFACE"

sudo /sbin/ping -S "$MAC_IP" -c 1 -W 1000 "$JETSON_IP" >/dev/null

if [[ "$mode" == "setup-only" ]]; then
  echo "USB route is ready. Try: ssh ${JETSON_USER}@${JETSON_IP}" >&2
  exit 0
fi

exec sudo /usr/bin/ssh \
  -b "$MAC_IP" \
  -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=10 \
  "${JETSON_USER}@${JETSON_IP}" \
  "$@"

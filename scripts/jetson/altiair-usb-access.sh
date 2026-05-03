#!/usr/bin/env bash
set -euo pipefail

# Run on the Jetson. Keep the NVIDIA L4T USB gadget bridge predictable so the
# Mac-side helper can use a stable static ARP entry.

BRIDGE="${ALTIAIR_USB_BRIDGE:-l4tbr0}"
BRIDGE_MAC="${ALTIAIR_USB_BRIDGE_MAC:-3e:c7:e7:79:f3:87}"
BRIDGE_CIDR="${ALTIAIR_USB_BRIDGE_CIDR:-192.168.55.1/24}"

if ip link show "$BRIDGE" >/dev/null 2>&1; then
  ip link set dev "$BRIDGE" address "$BRIDGE_MAC" 2>/dev/null || true
  ip addr replace "$BRIDGE_CIDR" dev "$BRIDGE" 2>/dev/null || true
  ip link set "$BRIDGE" up 2>/dev/null || true
fi

for dev in usb0 usb1; do
  if ip link show "$dev" >/dev/null 2>&1; then
    ip addr flush dev "$dev" 2>/dev/null || true
    ip link set "$dev" up 2>/dev/null || true
  fi
done

systemctl restart ssh 2>/dev/null || true

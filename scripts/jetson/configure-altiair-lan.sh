#!/usr/bin/env bash
set -euo pipefail

# Run on the Jetson. Create or refresh the local mission LAN without storing
# the AP password in the repository.

CON_NAME="${ALTIAIR_AP_CONNECTION:-altiair-lan}"
IFACE="${ALTIAIR_AP_IFACE:-}"
SSID="${ALTIAIR_AP_SSID:-Altiair-LAN}"
CIDR="${ALTIAIR_AP_CIDR:-192.168.42.20/24}"
CHANNEL="${ALTIAIR_AP_CHANNEL:-6}"
PASSWORD="${ALTIAIR_AP_PASSWORD:-}"

if [[ -z "$PASSWORD" ]]; then
  if [[ -t 0 ]]; then
    read -r -s -p "AP password for ${SSID}: " PASSWORD
    echo
  else
    echo "ALTIAIR_AP_PASSWORD is required in non-interactive mode." >&2
    exit 2
  fi
fi

if ((${#PASSWORD} < 8 || ${#PASSWORD} > 63)); then
  echo "AP password must be 8-63 characters for WPA-PSK." >&2
  exit 2
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli is required to configure ${SSID}." >&2
  exit 1
fi

if [[ -z "$IFACE" ]]; then
  IFACE="$(nmcli -t -f DEVICE,TYPE device status | awk -F: '$2 == "wifi" { print $1; exit }')"
fi

if [[ -z "$IFACE" ]] || ! ip link show "$IFACE" >/dev/null 2>&1; then
  echo "Wi-Fi interface not found: ${IFACE}" >&2
  exit 1
fi

sudo nmcli radio wifi on
sudo nmcli device set "$IFACE" managed yes || true

if sudo nmcli -t -f NAME connection show | grep -Fxq "$CON_NAME"; then
  sudo nmcli connection modify "$CON_NAME" \
    connection.interface-name "$IFACE" \
    connection.autoconnect yes \
    connection.autoconnect-priority 100 \
    connection.autoconnect-retries -1 \
    802-11-wireless.mode ap \
    802-11-wireless.ssid "$SSID" \
    802-11-wireless.band bg \
    802-11-wireless.channel "$CHANNEL" \
    802-11-wireless.powersave 2 \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    ipv4.method shared \
    ipv4.addresses "$CIDR" \
    ipv6.method ignore
else
  sudo nmcli connection add type wifi ifname "$IFACE" con-name "$CON_NAME" autoconnect yes ssid "$SSID"
  sudo nmcli connection modify "$CON_NAME" \
    connection.autoconnect-priority 100 \
    connection.autoconnect-retries -1 \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    802-11-wireless.channel "$CHANNEL" \
    802-11-wireless.powersave 2 \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$PASSWORD" \
    ipv4.method shared \
    ipv4.addresses "$CIDR" \
    ipv6.method ignore
fi

sudo nmcli connection up "$CON_NAME"

echo "Altiair LAN active:"
nmcli -f NAME,TYPE,DEVICE connection show --active | sed -n '1p;/'"$CON_NAME"'/p'
ip -brief addr show "$IFACE"

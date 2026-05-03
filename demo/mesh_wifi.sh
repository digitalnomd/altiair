#!/bin/bash
# setup_mesh_wifi.sh
# Run on each device to create the ad-hoc WiFi mesh (no router needed).
# Change the IP at the bottom: .1 for Node 1, .2 for Node 2.
#
# Usage:
#   chmod +x setup_mesh_wifi.sh
#   sudo ./setup_mesh_wifi.sh 1    ← for Node 1
#   sudo ./setup_mesh_wifi.sh 2    ← for Node 2

NODE=$1
if [ -z "$NODE" ]; then
  echo "Usage: sudo ./setup_mesh_wifi.sh <node_number>"
  exit 1
fi

IFACE="wlan0"
SSID="mesh_tactical"
CHANNEL=6
IP="192.168.42.$NODE"

echo "[+] Bringing down $IFACE"
ip link set $IFACE down

echo "[+] Setting ad-hoc mode"
iwconfig $IFACE mode ad-hoc
iwconfig $IFACE essid "$SSID"
iwconfig $IFACE channel $CHANNEL

echo "[+] Assigning IP $IP"
ip addr flush dev $IFACE
ip addr add $IP/24 dev $IFACE
ip link set $IFACE up

echo "[+] Done. Node $NODE is at $IP on network $SSID"
echo "    Ping test: ping 192.168.42.$( [ $NODE -eq 1 ] && echo 2 || echo 1 )"
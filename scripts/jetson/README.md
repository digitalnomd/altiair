# Jetson USB-C Access

The prepared Jetson exposes NVIDIA L4T USB gadget networking at:

- Jetson: `192.168.55.1`
- Mac: `192.168.55.100`
- User: `altiair`

From the Mac, restore the route and SSH:

```bash
scripts/jetson/ssh-usb.sh
```

To run one command:

```bash
scripts/jetson/ssh-usb.sh 'hostname && tegrastats'
```

If the Jetson clock resets after a reboot or power cycle, sync it from the Mac:

```bash
scripts/jetson/sync-time-usb.sh
```

The Mac helper intentionally stores no passwords. It may prompt for the Mac
administrator password because macOS route and ARP changes require privileges.

## Current Demo LAN Host

Until the Pi 5 is available, the Jetson can host the private mission LAN:

```bash
ALTIAIR_AP_PASSWORD='<local-demo-password>' scripts/jetson/configure-altiair-lan.sh
```

Defaults:

- SSID: `Altiair-LAN`
- Jetson LAN address: `192.168.42.20/24`
- Interface: first NetworkManager Wi-Fi device, or `ALTIAIR_AP_IFACE` if set

The AP host is only the underlay. Altiair coordination still uses peer evidence,
replication, and quorum logic; the Pi 5 can join or host the same LAN later.

For demo reliability, install the watchdog after the AP and node API are in
place:

```bash
scripts/jetson/install-altiair-lan-watchdog.sh scripts/jetson
```

The watchdog runs every 30 seconds, brings the `altiair-lan` NetworkManager AP
connection back up if needed, restarts `altiair-node` if it is down, and checks
the Jetson plus node-a/node-b health endpoints from the LAN side. The Mac USB
connection is a recovery path only; it is not required for normal demo runtime.

## Non-Disruptive Operator Proof

Do not switch the Mac off its normal internet Wi-Fi just to operate the mesh.
From the Mac, check whichever routes already exist:

```bash
npm run mesh:proof -- --status
```

If Jetson USB is reachable but the Mac cannot directly reach the `192.168.42.x`
LAN, run the full proof on the Jetson over USB:

```bash
npm run mesh:proof:remote
```

From the Jetson, check the physical fleet's node-local LLM state:

```bash
scripts/jetson/fleet-local-llm.sh --check
```

To repair the current three-node fleet from the Jetson, use the explicit apply
mode:

```bash
scripts/jetson/fleet-local-llm.sh --apply
```

`--apply` installs or repairs Ollama/Gemma on each target node if missing, so
use it only when physical node-local inference needs repair.

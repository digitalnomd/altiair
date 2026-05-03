# Raspberry Pi Headless Setup

Use this when a Raspberry Pi is booting Raspberry Pi OS for the first time and you do not have a monitor or keyboard. The goal is to preconfigure Wi-Fi, SSH, username/password, and a unique hostname before first boot.

## Official Downloads

- Raspberry Pi Imager: https://www.raspberrypi.com/software/
- Raspberry Pi OS images: https://www.raspberrypi.com/software/operating-systems/
- Raspberry Pi installation docs: https://www.raspberrypi.com/documentation/computers/getting-started.html
- Raspberry Pi cloud-init notes for newer OS images: https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/

For hackathon use, prefer **Raspberry Pi OS Lite 64-bit** unless you need a desktop environment.

## Recommended GUI Flow

1. Install and open Raspberry Pi Imager on the Mac.
2. Insert the microSD card.
3. Choose:
   - Device: your Raspberry Pi model
   - OS: Raspberry Pi OS Lite 64-bit
   - Storage: the microSD card
4. Click **Next**.
5. Choose **Edit Settings** when Imager asks about OS customization.
6. Set:
   - Hostname: something unique, such as `team42-pi1`
   - Username: for example `piuser`
   - Password: a password your team knows
   - Wi-Fi SSID and password
   - Wi-Fi country: `US`
   - Time zone: `America/Los_Angeles`
   - SSH: enabled, with password authentication unless you are using SSH keys
7. Write the image.
8. Put the card in the Pi and power it on.
9. Wait 2-5 minutes, then connect from the Mac:

```bash
ssh piuser@team42-pi1.local
```

If `.local` does not resolve, check the active link's client list if one exists, or scan the local subnet. On macOS:

```bash
ipconfig getifaddr en0
arp -a
```

If your Mac is on `192.168.1.37`, the subnet is usually `192.168.1.0/24`. If `nmap` is installed:

```bash
nmap -sn 192.168.1.0/24
```

## Scripted Customization Flow

The helper script in this repo customizes the SD card after the OS image has been written. This is useful when you already flashed an image and want a repeatable way to set per-device values.

1. Write Raspberry Pi OS to the microSD card with Raspberry Pi Imager.
2. Eject and reinsert the card if macOS does not automatically mount it.
3. Confirm the boot partition is mounted. It is usually:

```bash
ls /Volumes/bootfs
```

4. Run the script:

```bash
./scripts/customize_raspberry_pi_sd.sh \
  --boot /Volumes/bootfs \
  --hostname team42-pi1 \
  --username piuser \
  --wifi-ssid "YOUR_WIFI_NAME" \
  --wifi-country US \
  --timezone America/Los_Angeles
```

The script prompts for the Raspberry Pi user password and Wi-Fi password so they do not end up in shell history.

For multiple Pis, run it once per SD card with a different hostname:

```text
team42-pi1
team42-pi2
team42-pi3
```

The script supports both newer Raspberry Pi OS images that expose `user-data` and `network-config` on the boot partition, and older images that use `ssh`, `userconf.txt`, and `firstrun.sh`.

## Hackathon Network Notes

- A router, phone hotspot, or internet path is not required to prove the Altiair edge implementation.
- The physical baseline is the Pi 5 private mission LAN. `altiair-hub` creates `Altiair-LAN`; `altiair-node-a`, `altiair-node-b`, and `altiair-orin` join it.
- The fastest proof path is to boot one Pi at a time, then run logical nodes on the Pi 5 or laptop until `Altiair-LAN` is ready.
- Physical distribution across separate nodes requires the Pi 5 AP to be up before the failure demo so a bundle can replicate off the node that later goes down.
- To prove preservation, generate a bundle, verify it replicated to a surviving peer, then power down or isolate one node. Data that never left the failed node cannot be recovered by the mesh.
- If Jetson Wi-Fi fails, use Ethernet for `altiair-orin` when available.
- Venue Wi-Fi is optional for later internet/uplink only; do not depend on it for node-to-node traffic.
- Captive portal Wi-Fi usually does not work for headless first boot.
- A phone hotspot or travel router remains optional only as a backup or later uplink path.

Pi 5 AP baseline:

```bash
sudo nmcli device wifi hotspot ifname wlan0 con-name altiair-lan ssid Altiair-LAN password "change-this-demo-password"
```

If the Pi 5 uses its Wi-Fi radio as the AP, do not depend on that same Wi-Fi radio for internet. The local mesh works without internet; Foundry/CASK sync queues until any gateway gets an uplink later.

Field pattern after the hackathon:

- `Altiair-LAN` is one local cell.
- A drone, Hawkeye/vehicle kit, operator compute node, or gateway payload can host or bridge another local cell if that fits the deployment.
- Nodes keep their stable overlay identities and replicated ledger behavior regardless of which local cell carries the packets.

Example Wi-Fi customization, only when a normal SSID is available:

```bash
./scripts/customize_raspberry_pi_sd.sh \
  --boot /Volumes/bootfs \
  --hostname altiair-node-a \
  --username piuser \
  --wifi-ssid "OPTIONAL_NORMAL_WIFI_SSID" \
  --wifi-country US \
  --timezone America/Los_Angeles
```

## First Connection Checklist

After booting the Pi:

```bash
ssh piuser@team42-pi1.local
hostname
ip addr
sudo systemctl status ssh --no-pager
```

If SSH fails:

- Wait up to 5 minutes on first boot.
- Confirm the Wi-Fi network has no captive portal.
- Confirm the SSID and password are exact.
- Try the IP address instead of `.local`.
- Reinsert the SD card into the Mac and inspect the boot partition files.

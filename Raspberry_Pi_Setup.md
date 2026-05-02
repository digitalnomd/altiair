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

If `.local` does not resolve, check the router/device list or scan the local subnet. On macOS:

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

- The Pi must join a network before it has an IP address.
- Captive portal Wi-Fi usually does not work for headless first boot.
- A phone hotspot, travel router, or simple WPA/WPA2 Wi-Fi network is much more reliable.
- If using a travel router, turn off AP/client isolation so laptops and phones can reach the Pi.
- Ethernet is the simplest fallback if the Pi model has an Ethernet port.

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

#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
HOSTNAME=""
USERNAME=""
USER_PASSWORD=""
WIFI_SSID=""
WIFI_PASSWORD=""
WIFI_COUNTRY="US"
TIMEZONE="America/Los_Angeles"
MODE="auto"
SSH_KEY_FILE=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/customize_raspberry_pi_sd.sh \
    --boot /Volumes/bootfs \
    --hostname team42-pi1 \
    --username piuser \
    --wifi-ssid "Network Name" \
    --wifi-country US \
    --timezone America/Los_Angeles

Options:
  --boot PATH             Mounted Raspberry Pi boot partition. Default: /Volumes/bootfs
  --hostname NAME         Unique Pi hostname, e.g. team42-pi1
  --username NAME         Admin username to create
  --user-password PASS    Optional. If omitted, the script prompts securely.
  --wifi-ssid SSID        Wi-Fi network name
  --wifi-password PASS    Optional. If omitted, the script prompts securely.
  --wifi-country CODE     ISO country code for Wi-Fi regulatory domain. Default: US
  --timezone TZ           Time zone. Default: America/Los_Angeles
  --ssh-key FILE          Optional SSH public key to add for the user
  --mode auto|cloud-init|legacy
                           auto detects current Raspberry Pi OS boot files
  -h, --help              Show this help

This script customizes an already-written Raspberry Pi OS SD card. It does not
write the OS image to the card.
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
    --username)
      require_value "$1" "${2:-}"
      USERNAME="$2"
      shift 2
      ;;
    --user-password)
      require_value "$1" "${2:-}"
      USER_PASSWORD="$2"
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
    --timezone)
      require_value "$1" "${2:-}"
      TIMEZONE="$2"
      shift 2
      ;;
    --ssh-key)
      require_value "$1" "${2:-}"
      SSH_KEY_FILE="$2"
      shift 2
      ;;
    --mode)
      require_value "$1" "${2:-}"
      MODE="$2"
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

if [[ -z "$HOSTNAME" || -z "$USERNAME" || -z "$WIFI_SSID" ]]; then
  echo "Required: --hostname, --username, and --wifi-ssid" >&2
  usage >&2
  exit 2
fi

if [[ ! -d "$BOOT_DIR" ]]; then
  echo "Boot partition not found: $BOOT_DIR" >&2
  echo "Reinsert the SD card and check /Volumes for the mounted boot partition." >&2
  exit 1
fi

if [[ ! "$HOSTNAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$ ]]; then
  echo "Invalid hostname: $HOSTNAME" >&2
  echo "Use letters, numbers, and hyphens only. Start with a letter or number." >&2
  exit 2
fi

if [[ ! "$USERNAME" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]]; then
  echo "Invalid username: $USERNAME" >&2
  echo "Use lowercase letters, numbers, underscores, and hyphens. Start with a letter or underscore." >&2
  exit 2
fi

case "$MODE" in
  auto|cloud-init|legacy) ;;
  *)
    echo "Invalid --mode: $MODE" >&2
    exit 2
    ;;
esac

if [[ "$HOSTNAME$USERNAME$WIFI_SSID$WIFI_PASSWORD$TIMEZONE$WIFI_COUNTRY" == *$'\n'* ]]; then
  echo "Values must not contain newlines." >&2
  exit 2
fi

if [[ -z "$USER_PASSWORD" ]]; then
  read -r -s -p "Raspberry Pi password for $USERNAME: " USER_PASSWORD
  echo
fi

if [[ -z "$WIFI_PASSWORD" ]]; then
  read -r -s -p "Wi-Fi password for $WIFI_SSID: " WIFI_PASSWORD
  echo
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to hash the user password." >&2
  exit 1
fi

HASHED_PASSWORD="$(printf '%s\n' "$USER_PASSWORD" | openssl passwd -6 -stdin)"

yaml_quote() {
  printf "'"
  printf "%s" "$1" | sed "s/'/''/g"
  printf "'"
}

b64() {
  printf "%s" "$1" | base64 | tr -d '\n'
}

write_cloud_init() {
  local user_data="$BOOT_DIR/user-data"
  local network_config="$BOOT_DIR/network-config"
  local meta_data="$BOOT_DIR/meta-data"
  local ssh_key=""

  if [[ -n "$SSH_KEY_FILE" ]]; then
    if [[ ! -f "$SSH_KEY_FILE" ]]; then
      echo "SSH key file not found: $SSH_KEY_FILE" >&2
      exit 1
    fi
    ssh_key="$(<"$SSH_KEY_FILE")"
  fi

  {
    echo "#cloud-config"
    echo "hostname: $(yaml_quote "$HOSTNAME")"
    echo "manage_etc_hosts: true"
    echo "timezone: $(yaml_quote "$TIMEZONE")"
    echo "disable_root: true"
    echo "ssh_pwauth: true"
    echo "enable_ssh: true"
    echo "users:"
    echo "  - name: $(yaml_quote "$USERNAME")"
    echo "    gecos: $(yaml_quote "$USERNAME")"
    echo "    groups: users,adm,dialout,audio,netdev,video,plugdev,cdrom,games,input,gpio,spi,i2c,render,sudo"
    echo "    shell: /bin/bash"
    echo "    lock_passwd: false"
    echo "    passwd: $(yaml_quote "$HASHED_PASSWORD")"
    echo "    sudo: ALL=(ALL) NOPASSWD:ALL"
    if [[ -n "$ssh_key" ]]; then
      echo "    ssh_authorized_keys:"
      echo "      - $(yaml_quote "$ssh_key")"
    fi
  } > "$user_data"

  {
    echo "network:"
    echo "  version: 2"
    echo "  wifis:"
    echo "    renderer: NetworkManager"
    echo "    wlan0:"
    echo "      dhcp4: true"
    echo "      regulatory-domain: $(yaml_quote "$WIFI_COUNTRY")"
    echo "      access-points:"
    echo "        $(yaml_quote "$WIFI_SSID"):"
    echo "          password: $(yaml_quote "$WIFI_PASSWORD")"
    echo "      optional: true"
  } > "$network_config"

  {
    echo "instance-id: $(yaml_quote "$HOSTNAME")"
    echo "local-hostname: $(yaml_quote "$HOSTNAME")"
  } > "$meta_data"
}

write_legacy() {
  local cmdline="$BOOT_DIR/cmdline.txt"
  local firstrun="$BOOT_DIR/firstrun.sh"
  local tmp_cmdline

  if [[ ! -f "$cmdline" ]]; then
    echo "Cannot find $cmdline for legacy first-boot customization." >&2
    exit 1
  fi

  : > "$BOOT_DIR/ssh"
  printf '%s:%s\n' "$USERNAME" "$HASHED_PASSWORD" > "$BOOT_DIR/userconf.txt"

  cat > "$firstrun" <<EOF
#!/bin/bash
set +e

decode_b64() {
  printf '%s' "\$1" | base64 -d
}

HOSTNAME="\$(decode_b64 '$(b64 "$HOSTNAME")')"
WIFI_SSID="\$(decode_b64 '$(b64 "$WIFI_SSID")')"
WIFI_PASSWORD="\$(decode_b64 '$(b64 "$WIFI_PASSWORD")')"
WIFI_COUNTRY="\$(decode_b64 '$(b64 "$WIFI_COUNTRY")')"
TIMEZONE="\$(decode_b64 '$(b64 "$TIMEZONE")')"

rfkill unblock wifi || true
for filename in /var/lib/systemd/rfkill/*:wlan; do
  [ -e "\$filename" ] && echo 0 > "\$filename"
done

if command -v raspi-config >/dev/null 2>&1; then
  raspi-config nonint do_wifi_country "\$WIFI_COUNTRY" || true
fi

CURRENT_HOSTNAME="\$(cat /etc/hostname 2>/dev/null | tr -d ' \t\n\r')"
echo "\$HOSTNAME" > /etc/hostname
if grep -q '^127\.0\.1\.1' /etc/hosts; then
  sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1\t\$HOSTNAME/" /etc/hosts
elif [ -n "\$CURRENT_HOSTNAME" ]; then
  sed -i "s/127\\.0\\.1\\.1.*\$CURRENT_HOSTNAME/127.0.1.1\t\$HOSTNAME/" /etc/hosts
else
  printf '127.0.1.1\t%s\n' "\$HOSTNAME" >> /etc/hosts
fi

echo "\$TIMEZONE" > /etc/timezone
rm -f /etc/localtime
ln -sf "/usr/share/zoneinfo/\$TIMEZONE" /etc/localtime
dpkg-reconfigure -f noninteractive tzdata || true

install -d -m 700 /etc/NetworkManager/system-connections
CONN_FILE="/etc/NetworkManager/system-connections/hackathon-wifi.nmconnection"
CONN_UUID="\$(cat /proc/sys/kernel/random/uuid)"
cat > "\$CONN_FILE" <<NMEOF
[connection]
id=hackathon-wifi
uuid=\$CONN_UUID
type=wifi
interface-name=wlan0
autoconnect=true

[wifi]
mode=infrastructure
ssid=\$WIFI_SSID

[wifi-security]
key-mgmt=wpa-psk
psk=\$WIFI_PASSWORD

[ipv4]
method=auto

[ipv6]
addr-gen-mode=default
method=auto

[proxy]
NMEOF
chmod 600 "\$CONN_FILE"

systemctl enable ssh || systemctl enable ssh.service || true

rm -f /boot/firstrun.sh /boot/firmware/firstrun.sh
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
exit 0
EOF

  chmod +x "$firstrun"

  if ! grep -q 'systemd.run=' "$cmdline"; then
    tmp_cmdline="$(mktemp)"
    tr -d '\n' < "$cmdline" > "$tmp_cmdline"
    printf ' systemd.run=/boot/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' >> "$tmp_cmdline"
    mv "$tmp_cmdline" "$cmdline"
  fi
}

if [[ "$MODE" == "auto" ]]; then
  if [[ -f "$BOOT_DIR/user-data" || -f "$BOOT_DIR/network-config" || -f "$BOOT_DIR/meta-data" ]]; then
    MODE="cloud-init"
  else
    MODE="legacy"
  fi
fi

case "$MODE" in
  cloud-init)
    write_cloud_init
    ;;
  legacy)
    write_legacy
    ;;
esac

cat <<EOF
Customized $BOOT_DIR using $MODE mode.

Next:
  1. Eject the SD card.
  2. Boot the Raspberry Pi.
  3. Wait 2-5 minutes.
  4. Connect with:

     ssh $USERNAME@$HOSTNAME.local
EOF

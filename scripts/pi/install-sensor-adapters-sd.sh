#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
NODE_ID="altiair-node-a"
API_PORT="8081"
ADAPTERS="auto"
ZONE_ID="field-zone-alpha"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/install-sensor-adapters-sd.sh \
    --boot /Volumes/bootfs \
    --node-id altiair-node-a \
    --api-port 8081 \
    --adapters camera

Copies the real camera/RFID adapters to a mounted Raspberry Pi boot partition
and schedules a one-shot boot install of persistent systemd services.
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
    --node-id)
      require_value "$1" "${2:-}"
      NODE_ID="$2"
      shift 2
      ;;
    --api-port)
      require_value "$1" "${2:-}"
      API_PORT="$2"
      shift 2
      ;;
    --adapters)
      require_value "$1" "${2:-}"
      ADAPTERS="$2"
      shift 2
      ;;
    --zone-id)
      require_value "$1" "${2:-}"
      ZONE_ID="$2"
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
  echo "Boot partition not found: ${BOOT_DIR}" >&2
  exit 1
fi

cmdline="${BOOT_DIR}/cmdline.txt"
if [[ ! -f "$cmdline" ]]; then
  echo "Expected cmdline.txt under ${BOOT_DIR}" >&2
  exit 1
fi

for file in camera-event-adapter.py audio-event-adapter.py rfid-event-adapter.py install-sensor-adapter-services.sh; do
  if [[ ! -f "${SOURCE_DIR}/${file}" ]]; then
    echo "Missing source file: ${SOURCE_DIR}/${file}" >&2
    exit 1
  fi
  install -m 0755 "${SOURCE_DIR}/${file}" "${BOOT_DIR}/altiair-${file}"
done

cat > "${BOOT_DIR}/altiair-sensor-adapters-firstboot.sh" <<EOF
#!/bin/bash
set +e

BOOT=/boot/firmware
[ -f "\$BOOT/altiair-install-sensor-adapter-services.sh" ] || BOOT=/boot
LOG="\$BOOT/altiair-sensor-adapters.log"

{
  echo "sensor adapter firstboot start \$(date -Iseconds)"
  install -d -m 0755 /tmp/altiair-sensor-adapters
  install -m 0755 "\$BOOT/altiair-camera-event-adapter.py" /tmp/altiair-sensor-adapters/camera-event-adapter.py
  install -m 0755 "\$BOOT/altiair-audio-event-adapter.py" /tmp/altiair-sensor-adapters/audio-event-adapter.py
  install -m 0755 "\$BOOT/altiair-rfid-event-adapter.py" /tmp/altiair-sensor-adapters/rfid-event-adapter.py
  install -m 0755 "\$BOOT/altiair-install-sensor-adapter-services.sh" /tmp/altiair-sensor-adapters/install-sensor-adapter-services.sh

  export ALTIAIR_NODE_ID='${NODE_ID}'
  export ALTIAIR_API_PORT='${API_PORT}'
  export ALTIAIR_SENSOR_ADAPTERS='${ADAPTERS}'
  export ALTIAIR_ZONE_ID='${ZONE_ID}'
  /tmp/altiair-sensor-adapters/install-sensor-adapter-services.sh /tmp/altiair-sensor-adapters || true

  systemctl --no-pager --full status altiair-camera-adapter.service altiair-rfid-adapter.service || true
  echo "sensor adapter firstboot end \$(date -Iseconds)"
} >> "\$LOG" 2>&1

sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
rm -f /boot/altiair-sensor-adapters-firstboot.sh /boot/firmware/altiair-sensor-adapters-firstboot.sh
exit 0
EOF
chmod +x "${BOOT_DIR}/altiair-sensor-adapters-firstboot.sh"

adapter_hook='if [ -x /boot/firmware/altiair-sensor-adapters-firstboot.sh ]; then /boot/firmware/altiair-sensor-adapters-firstboot.sh || true; elif [ -x /boot/altiair-sensor-adapters-firstboot.sh ]; then /boot/altiair-sensor-adapters-firstboot.sh || true; fi'

firstrun="${BOOT_DIR}/firstrun.sh"
if [[ -f "$firstrun" ]]; then
  if ! grep -q 'altiair-sensor-adapters-firstboot.sh' "$firstrun"; then
    tmp_firstrun="$(mktemp)"
    awk -v hook="$adapter_hook" '
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
${adapter_hook}
rm -f /boot/firstrun.sh /boot/firmware/firstrun.sh
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
exit 0
EOF
  chmod +x "$firstrun"
fi

if [[ -f "$BOOT_DIR/issue.txt" ]] && grep -Eq 'Raspberry Pi reference 202[3-9]|Debian GNU/Linux (12|13|14|15)' "$BOOT_DIR/issue.txt"; then
  firstboot_target="/boot/firmware/firstrun.sh"
else
  firstboot_target="/boot/firstrun.sh"
fi

tmp_cmdline="$(mktemp)"
tr -d '\n' < "$cmdline" \
  | sed -E 's| systemd\.run=[^ ]*||g; s| systemd\.run_success_action=[^ ]*||g; s| systemd\.unit=kernel-command-line.target||g' \
  > "$tmp_cmdline"
printf ' systemd.run=%s systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' "$firstboot_target" >> "$tmp_cmdline"
mv "$tmp_cmdline" "$cmdline"

printf 'Scheduled Altiair sensor adapter install on %s for %s (%s, API port %s)\n' \
  "$BOOT_DIR" "$NODE_ID" "$ADAPTERS" "$API_PORT"

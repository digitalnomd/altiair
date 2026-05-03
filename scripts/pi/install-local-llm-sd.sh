#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
MODEL="${LOCAL_LLM_MODEL:-gemma4:e2b}"
FALLBACK_MODEL="${ALTIAIR_LLM_FALLBACK_MODEL:-gemma3:1b}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/install-local-llm-sd.sh \
    --boot /Volumes/bootfs \
    --model gemma4:e2b

Copies the local LLM repair installer to a mounted Raspberry Pi boot partition
and schedules a one-shot boot hook that installs a retrying systemd service.
The service installs/repairs Ollama, pulls the approved local model, flips
/etc/altiair/altiair-node.env to LOCAL_LLM_MODE=ollama, and restarts the node.
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
    --model)
      require_value "$1" "${2:-}"
      MODEL="$2"
      shift 2
      ;;
    --fallback-model)
      require_value "$1" "${2:-}"
      FALLBACK_MODEL="$2"
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
firstrun="${BOOT_DIR}/firstrun.sh"
hook="${BOOT_DIR}/altiair-local-llm-firstboot.sh"

if [[ ! -f "$cmdline" ]]; then
  echo "Expected cmdline.txt under ${BOOT_DIR}" >&2
  exit 1
fi

if [[ "$MODEL$FALLBACK_MODEL" == *$'\n'* ]]; then
  echo "Model names must not contain newlines." >&2
  exit 2
fi

install -m 0755 "${SOURCE_DIR}/install-local-llm.sh" "${BOOT_DIR}/altiair-install-local-llm.sh"

cat > "$hook" <<EOF
#!/bin/bash
set +e

BOOT=/boot/firmware
[ -f "\$BOOT/altiair-install-local-llm.sh" ] || BOOT=/boot
LOG="\$BOOT/altiair-local-llm.log"
MODEL='${MODEL}'
FALLBACK_MODEL='${FALLBACK_MODEL}'

{
  echo "local llm firstboot start \$(date -Iseconds)"
  install -d -m 0755 /usr/local/sbin
  install -m 0755 "\$BOOT/altiair-install-local-llm.sh" /usr/local/sbin/altiair-install-local-llm.sh

  cat > /etc/systemd/system/altiair-local-llm.service <<SERVICE_EOF
[Unit]
Description=Altiair node-local Ollama repair
After=network-online.target altiair-node.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=LOCAL_LLM_MODEL=${MODEL}
Environment=ALTIAIR_LLM_FALLBACK_MODEL=${FALLBACK_MODEL}
ExecStart=/usr/local/sbin/altiair-install-local-llm.sh
ExecStartPost=/bin/systemctl disable --now altiair-local-llm.timer
SERVICE_EOF

  cat > /etc/systemd/system/altiair-local-llm.timer <<'TIMER_EOF'
[Unit]
Description=Retry Altiair node-local Ollama repair

[Timer]
OnBootSec=90
OnUnitActiveSec=10min
AccuracySec=30
Unit=altiair-local-llm.service

[Install]
WantedBy=timers.target
TIMER_EOF

  systemctl daemon-reload || true
  systemctl enable --now altiair-local-llm.timer || true
  systemctl start --no-block altiair-local-llm.service || true

  sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
  echo "local llm firstboot end \$(date -Iseconds)"
} >> "\$LOG" 2>&1

rm -f /boot/altiair-local-llm-firstboot.sh /boot/firmware/altiair-local-llm-firstboot.sh
exit 0
EOF
chmod +x "$hook"

llm_hook='if [ -x /boot/firmware/altiair-local-llm-firstboot.sh ]; then /boot/firmware/altiair-local-llm-firstboot.sh || true; elif [ -x /boot/altiair-local-llm-firstboot.sh ]; then /boot/altiair-local-llm-firstboot.sh || true; fi'

if [[ -f "$firstrun" ]]; then
  if ! grep -q 'altiair-local-llm-firstboot.sh' "$firstrun"; then
    tmp_firstrun="$(mktemp)"
    awk -v hook="$llm_hook" '
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
${llm_hook}
rm -f /boot/firstrun.sh /boot/firmware/firstrun.sh
sed -i 's| systemd.run=[^ ]*||g; s| systemd.run_success_action=[^ ]*||g; s| systemd.unit=kernel-command-line.target||g' /boot/cmdline.txt /boot/firmware/cmdline.txt 2>/dev/null || true
exit 0
EOF
  chmod +x "$firstrun"
fi

if [[ -f "$BOOT_DIR/issue.txt" ]] && grep -Eq 'Raspberry Pi reference 202[3-9]|Debian GNU/Linux (12|13|14|15)' "$BOOT_DIR/issue.txt"; then
  firstrun_target="/boot/firmware/firstrun.sh"
else
  firstrun_target="/boot/firstrun.sh"
fi

tmp_cmdline="$(mktemp)"
tr -d '\n' < "$cmdline" |
  sed -E 's| systemd\.run=[^ ]*||g; s| systemd\.run_success_action=[^ ]*||g; s| systemd\.unit=kernel-command-line.target||g' \
  > "$tmp_cmdline"
printf ' systemd.run=%s systemd.run_success_action=reboot systemd.unit=kernel-command-line.target\n' "$firstrun_target" >> "$tmp_cmdline"
mv "$tmp_cmdline" "$cmdline"

printf 'Scheduled Altiair node-local LLM repair on %s with model %s.\n' "$BOOT_DIR" "$MODEL"

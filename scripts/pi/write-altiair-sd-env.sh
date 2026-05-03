#!/usr/bin/env bash
set -euo pipefail

BOOT_DIR="/Volumes/bootfs"
ENV_SOURCE=""
DEST_NAME="altiair-node.env"

usage() {
  cat <<'EOF'
Usage:
  scripts/pi/write-altiair-sd-env.sh \
    --boot /Volumes/bootfs \
    --env scripts/pi/env/altiair-node-a.env

Options:
  --boot PATH       Mounted Raspberry Pi boot partition. Default: /Volumes/bootfs
  --env FILE        Per-node env file to copy onto the boot partition
  --dest NAME       Destination filename. Default: altiair-node.env
  -h, --help        Show this help

This copies only non-secret node defaults. Do not put Foundry client secrets,
registry tokens, private WireGuard keys, or API bearer tokens on the boot
partition unless the team has explicitly accepted that local risk.
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
    --env)
      require_value "$1" "${2:-}"
      ENV_SOURCE="$2"
      shift 2
      ;;
    --dest)
      require_value "$1" "${2:-}"
      DEST_NAME="$2"
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

if [[ -z "$ENV_SOURCE" ]]; then
  echo "Required: --env FILE" >&2
  usage >&2
  exit 2
fi

if [[ ! -d "$BOOT_DIR" ]]; then
  echo "Boot partition not found: $BOOT_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_SOURCE" ]]; then
  echo "Env file not found: $ENV_SOURCE" >&2
  exit 1
fi

case "$DEST_NAME" in
  */*|""|.*)
    echo "Invalid destination filename: $DEST_NAME" >&2
    exit 2
    ;;
esac

cp "$ENV_SOURCE" "$BOOT_DIR/$DEST_NAME"
chmod 600 "$BOOT_DIR/$DEST_NAME" 2>/dev/null || true

cat <<EOF
Copied $ENV_SOURCE to $BOOT_DIR/$DEST_NAME.

On first install, scripts/pi/install-altiair-node.sh will copy it to:
  /etc/altiair/altiair-node.env
EOF

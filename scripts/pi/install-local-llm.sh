#!/usr/bin/env bash
set -euo pipefail

# Run on each Pi/Jetson node. Installs Ollama if missing, pulls the configured
# approved local model, warms it once, and flips the Altiair node env to ollama.

ENV_FILE="${ALTIAIR_ENV_FILE:-/etc/altiair/altiair-node.env}"
MODEL="${LOCAL_LLM_MODEL:-gemma4:e2b}"
FALLBACK_MODEL="${ALTIAIR_LLM_FALLBACK_MODEL:-gemma3:1b}"
OLLAMA_HOST_VALUE="${OLLAMA_HOST:-0.0.0.0:11434}"

if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates
fi

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/altiair.conf >/dev/null <<EOF
[Service]
Environment=OLLAMA_HOST=${OLLAMA_HOST_VALUE}
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ollama

ready=0
for _ in {1..60}; do
  if curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" != "1" ]]; then
  systemctl --no-pager --full status ollama || true
  echo "Ollama did not become ready on 127.0.0.1:11434" >&2
  exit 1
fi

selected_model="$MODEL"
if ! ollama pull "$selected_model"; then
  if [[ "$FALLBACK_MODEL" == "$MODEL" ]]; then
    exit 1
  fi
  selected_model="$FALLBACK_MODEL"
  ollama pull "$selected_model"
fi

ollama run "$selected_model" 'Return {"ready":true} as strict JSON.' >/tmp/altiair-ollama-warm.txt

sudo mkdir -p "$(dirname "$ENV_FILE")"
if [[ ! -f "$ENV_FILE" ]]; then
  sudo tee "$ENV_FILE" >/dev/null <<EOF
LOCAL_LLM_MODE=ollama
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=${selected_model}
EOF
else
  sudo cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  if grep -q '^LOCAL_LLM_MODE=' "$ENV_FILE"; then
    sudo sed -i 's/^LOCAL_LLM_MODE=.*/LOCAL_LLM_MODE=ollama/' "$ENV_FILE"
  else
    echo 'LOCAL_LLM_MODE=ollama' | sudo tee -a "$ENV_FILE" >/dev/null
  fi
  if grep -q '^LOCAL_LLM_BASE_URL=' "$ENV_FILE"; then
    sudo sed -i 's#^LOCAL_LLM_BASE_URL=.*#LOCAL_LLM_BASE_URL=http://127.0.0.1:11434#' "$ENV_FILE"
  else
    echo 'LOCAL_LLM_BASE_URL=http://127.0.0.1:11434' | sudo tee -a "$ENV_FILE" >/dev/null
  fi
  if grep -q '^LOCAL_LLM_MODEL=' "$ENV_FILE"; then
    sudo sed -i "s/^LOCAL_LLM_MODEL=.*/LOCAL_LLM_MODEL=${selected_model}/" "$ENV_FILE"
  else
    echo "LOCAL_LLM_MODEL=${selected_model}" | sudo tee -a "$ENV_FILE" >/dev/null
  fi
fi

if systemctl list-unit-files altiair-node.service >/dev/null 2>&1; then
  sudo systemctl restart altiair-node.service
fi

echo "__ALTIAIR_LOCAL_LLM_READY__ node=$(hostname) model=${selected_model} env=${ENV_FILE}"

# Pi Deployment Scripts

These scripts are the prepared Pi-side entry points for the CASK edge node runtime.

## Files

| File | Purpose |
| --- | --- |
| `install-altiair-node.sh` | Installs dependencies, runs `npm ci`, writes `/etc/altiair/altiair-node.env` if missing, and creates a systemd service. |
| `run-altiair-node.sh` | Starts the node API using the env file. |
| `post-sensor-events.sh` | Posts live adapter JSON to `POST /sensor-events`. |
| `watch-local-instructions.sh` | Polls `GET /instructions/latest` for the current node's local CASK tag-plan assignment. |
| `sample-live-events.json` | Smoke payload for RFID, microphone, and camera merge. |
| `env/*.env` | Per-node starter env files for the two Pi 4Bs, Pi 5 hub, and Jetson Orin Nano. |

## Install On Each Pi

Copy the repo to the Pi, choose the matching env file, then run:

```bash
sudo mkdir -p /etc/altiair
sudo cp scripts/pi/env/altiair-node-a.env /etc/altiair/altiair-node.env
scripts/pi/install-altiair-node.sh
```

Use:

- `scripts/pi/env/altiair-node-a.env` for Pi 4B A.
- `scripts/pi/env/altiair-node-b.env` for Pi 4B B.
- `scripts/pi/env/altiair-hub.env` for the Pi 5 hub.
- `scripts/pi/env/altiair-orin.env` for the Jetson Orin Nano.

## Smoke Test

On a running node:

```bash
scripts/pi/post-sensor-events.sh scripts/pi/sample-live-events.json
curl -sS http://127.0.0.1:8080/instructions/latest
curl -sS http://127.0.0.1:8080/insights/latest
```

For the local LLM, keep `LOCAL_LLM_MODE=mock` until Ollama or another approved local runtime is installed on that node. Then switch to `LOCAL_LLM_MODE=ollama` and keep `LOCAL_LLM_MODEL` on an approved non-Chinese model. Gemma is the default starter model in these env files.

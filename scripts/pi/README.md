# Pi Deployment Scripts

These scripts are the prepared Pi-side entry points for the CASK edge node runtime.

## Files

| File | Purpose |
| --- | --- |
| `install-altiair-node.sh` | Installs dependencies, runs `npm ci`, writes `/etc/altiair/altiair-node.env` if missing, and creates a systemd service. |
| `run-altiair-node.sh` | Starts the node API using the env file. |
| `write-altiair-sd-env.sh` | Copies a per-node env file onto a mounted SD boot partition for first install. |
| `ssh-tunnel-to-node.sh` | Opens local SSH forwards to a remote node API and UI server. |
| `post-sensor-events.sh` | Posts live adapter JSON to `POST /sensor-events`. |
| `camera-event-adapter.py` | Captures a real camera frame and posts a `camera_detection` event after capture succeeds. |
| `audio-event-adapter.py` | Captures a USB microphone window and posts an `audio_window` event. |
| `rfid-event-adapter.py` | Reads serial or keyboard-wedge RFID readers and posts `rfid_read` events. |
| `install-sensor-adapter-services.sh` | Installs camera/audio/RFID adapters as systemd services on the matching node. |
| `install-sensor-adapters-sd.sh` | Writes a one-shot SD-card boot installer for the sensor adapter services. |
| `replay-mock-scenario.sh` | Replays the deterministic CASK mock sensor scenario into the local node API. |
| `start-hawkeye-feed.sh` | Starts the Hawkeye-style online/mock visual-track feed into the node API. |
| `install-hawkeye-feed-service.sh` | Installs the Hawkeye-style feed as a persistent systemd service. |
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

For SD-card preparation before first boot:

```bash
./scripts/customize_raspberry_pi_sd.sh \
  --boot /Volumes/bootfs \
  --hostname altiair-node-a \
  --username altiair \
  --wifi-ssid Altiair-LAN \
  --ssh-key ~/.ssh/id_ed25519.pub

scripts/pi/write-altiair-sd-env.sh \
  --boot /Volumes/bootfs \
  --env scripts/pi/env/altiair-node-a.env
```

The installer will copy `/boot/firmware/altiair-node.env` or `/boot/altiair-node.env` into `/etc/altiair/altiair-node.env` if present.

## Remote Teammate Access

After the Pi is booted and reachable:

```bash
scripts/pi/ssh-tunnel-to-node.sh altiair@altiair-hub.local
```

Then use:

```text
http://127.0.0.1:18080/dashboard
http://127.0.0.1:14173/
```

See [Teammate Remote Pi and Frontend Handoff](../../docs/teammate-remote-pi-frontend-handoff.md) for the full frontend and remote access contract.

## Smoke Test

On a running node:

```bash
scripts/pi/post-sensor-events.sh scripts/pi/sample-live-events.json
curl -sS http://127.0.0.1:8080/instructions/latest
curl -sS http://127.0.0.1:8080/insights/latest
curl -sS http://127.0.0.1:8080/dashboard
```

For attached peripherals:

```bash
ALTIAIR_NODE_ID=altiair-orin ALTIAIR_API_PORT=8080 \
  scripts/pi/audio-event-adapter.py --once --microphone-id jetson-usb-mic --zone-id field-zone-alpha

ALTIAIR_NODE_ID=altiair-node-b ALTIAIR_API_PORT=8082 \
  scripts/pi/rfid-event-adapter.py --once --reader-id node-b-rfid --zone-id field-zone-alpha

ALTIAIR_NODE_ID=altiair-hub ALTIAIR_API_PORT=8080 \
  scripts/pi/camera-event-adapter.py --once --camera-id pi5-camera --zone-id field-zone-alpha
```

The camera adapter emits only after a frame is actually captured. The audio
adapter captures a USB microphone window and posts RMS/peak-derived acoustic
metadata; by default it can keep the demo alive with mock audio if ALSA is not
ready. The RFID adapter auto-detects serial readers under `/dev/ttyUSB*` or
`/dev/ttyACM*` and keyboard-wedge readers under `/dev/input/event*`; pass
`--device` or `--input-event` if the reader exposes a non-obvious path.

To make this persistent for the demo, run on each Pi after the node API is
installed:

```bash
scripts/pi/install-sensor-adapter-services.sh scripts/pi
```

With `ALTIAIR_SENSOR_ADAPTERS=auto`, the Jetson installs audio and node-b
installs RFID. The Pi 5 camera is installed explicitly with
`ALTIAIR_SENSOR_ADAPTERS=camera` once `altiair-hub` is added. The adapters post
to the local node API and do not require the Mac USB connection to remain
attached.

For the current three-node demo, start the Hawkeye-style online/mock feed on the
Jetson:

```bash
scripts/pi/start-hawkeye-feed.sh --interval-ms 10000
```

Install it persistently:

```bash
scripts/pi/install-hawkeye-feed-service.sh
```

If SSH is unavailable, apply the same service install through a mounted SD card:

```bash
scripts/pi/install-sensor-adapters-sd.sh \
  --boot /Volumes/bootfs \
  --node-id altiair-node-a \
  --api-port 8081 \
  --adapters camera
```

Replay the full deterministic mock scenario:

```bash
scripts/pi/replay-mock-scenario.sh
curl -sS http://127.0.0.1:8080/mission-continuity
curl -sS http://127.0.0.1:8080/dashboard
```

For the local LLM, keep `LOCAL_LLM_MODE=mock` until Ollama or another approved local runtime is installed on that node. Then switch to `LOCAL_LLM_MODE=ollama` and keep `LOCAL_LLM_MODEL` on an approved non-Chinese model. Gemma is the default starter model in these env files.

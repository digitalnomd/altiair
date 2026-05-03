# Ben Three-Node Demo Runbook

This is the handoff state before the Pi 5 is added.

## Current Nodes

| Node | Address | Role today | Sensor/feed today |
| --- | --- | --- | --- |
| `altiair-orin` | `192.168.42.20` | Jetson LAN host, local LLM/API, Hawkeye-style visual/track feed, USB microphone target | `hawkeye:feed` plus `audio-event-adapter.py` |
| `altiair-node-a` | `192.168.42.11` | Deployable Pi 4B peer, health/replication/local instruction recipient | Node API and mesh health |
| `altiair-node-b` | `192.168.42.12` | RFID Pi 4B peer | `rfid-event-adapter.py` |
| `altiair-hub` | `192.168.42.10` | Reserved Pi 5 fourth node | Camera/display/hub path tomorrow |

The Pi 5 is intentionally represented as reserved/offline until Ben adds it. The current demo should still show a working three-node mesh with live node health, replicated CASK records, coordinator election, local LLM output, stream records, and queued/mock Foundry sync.

## What Is Implemented

- Node API: `npm run node:api`
- Memory-safe durable agent: `npm run agent:smoke`
- Mission deployment/ontology-shaped CASK records: `POST /mission/deploy`
- Sensor ingest: `POST /sensor-events`
- Local LLM insight path: mock by default, Ollama-compatible when configured
- Mesh/gateway/coordinator/replication: `/dashboard`, `/coordinator/latest`, `/replication/latest`, `/mission-continuity`
- Always-on stream spine: `/stream/topics`, `/stream/status`, `/stream/records`
- Mock/online Hawkeye-style feed: `npm run hawkeye:feed`
- Jetson USB microphone adapter: `scripts/pi/audio-event-adapter.py`
- Pi 5 camera adapter: `scripts/pi/camera-event-adapter.py`
- RFID adapter with retrying hardware discovery: `scripts/pi/rfid-event-adapter.py`

## Start The Demo On The Jetson

From the repo checkout on `altiair-orin`:

```bash
cd /opt/altiair
npm ci
npm run build
```

Start the node API:

```bash
ALTIAIR_NODE_ID=altiair-orin \
ALTIAIR_API_HOST=0.0.0.0 \
ALTIAIR_API_PORT=8080 \
LOCAL_LLM_MODE=mock \
FOUNDRY_MODE=mock \
npm run node:api -- --node altiair-orin --port 8080
```

Seed mission deployment, mock sensor ingest, local LLM, stream, coordinator, replication, and mock Foundry sync:

```bash
npm run demo:bootstrap -- --base-url http://127.0.0.1:8080
```

Run a continuous Hawkeye-style feed. It attempts public OpenSky ADS-B state vectors for the local bbox and falls back to deterministic local track data if the internet/API is unavailable or rate-limited:

```bash
scripts/pi/start-hawkeye-feed.sh --interval-ms 10000
```

Use forced deterministic mode when venue internet is bad:

```bash
ALTIAIR_HAWKEYE_SOURCE=mock scripts/pi/start-hawkeye-feed.sh --interval-ms 10000
```

## Verify The Mesh

```bash
curl -sS http://127.0.0.1:8080/health
curl -sS http://127.0.0.1:8080/dashboard
curl -sS http://127.0.0.1:8080/coordinator/latest
curl -sS http://127.0.0.1:8080/insights/latest
curl -sS http://127.0.0.1:8080/stream/status
curl -sS http://127.0.0.1:8080/mission/deployment/latest
```

Expected:

- `altiair-orin`, `altiair-node-a`, and `altiair-node-b` are reachable.
- `altiair-hub` is reserved/offline until the Pi 5 joins.
- `/insights/latest` returns a local LLM insight.
- `/stream/status` has records on sensor, location, health, cue, insight, coordinator, and Foundry-sync topics after bootstrap/upload.
- `/coordinator/latest` has exactly one leader for the current term.

## Install Jetson USB Microphone

Plug the USB microphone into `altiair-orin`, then:

```bash
sudo apt-get update
sudo apt-get install -y alsa-utils
arecord -l
```

Set the device if ALSA does not use the microphone as `default`:

```bash
export ALTIAIR_AUDIO_DEVICE=hw:1,0
```

Install the persistent adapter:

```bash
cd /opt/altiair
ALTIAIR_NODE_ID=altiair-orin \
ALTIAIR_API_PORT=8080 \
ALTIAIR_SENSOR_ADAPTERS=audio \
ALTIAIR_MICROPHONE_ID=jetson-usb-mic \
scripts/pi/install-sensor-adapter-services.sh scripts/pi
```

Check it:

```bash
systemctl --no-pager --full status altiair-audio-adapter.service
journalctl -u altiair-audio-adapter.service -n 80 --no-pager
curl -sS http://127.0.0.1:8080/bundles/pending
```

The adapter posts `audio_window` events. It can keep the demo running with mock audio if ALSA is missing by default; set `ALTIAIR_AUDIO_MOCK_IF_MISSING=0` to require the real microphone.

## Install Pi 5 Camera Tomorrow

On the Pi 5 (`altiair-hub`), install the repo and node API, then plug in the camera using the Raspberry Pi camera connector. Boot with `altiair-hub` on `Altiair-LAN`.

Verify the camera:

```bash
rpicam-still --list-cameras
rpicam-still -n --immediate --timeout 1000 -o /tmp/pi5-camera-test.jpg
```

Install the persistent camera adapter:

```bash
cd /opt/altiair
ALTIAIR_NODE_ID=altiair-hub \
ALTIAIR_API_PORT=8080 \
ALTIAIR_SENSOR_ADAPTERS=camera \
ALTIAIR_CAMERA_ID=pi5-camera \
ALTIAIR_CAMERA_DETECTION_CLASS=uas_pi5_camera_frame \
ALTIAIR_CAMERA_RETENTION_POLICY=thumbnail_allowed \
scripts/pi/install-sensor-adapter-services.sh scripts/pi
```

Then switch the Hawkeye/visual mock feed to the Pi 5 camera node or stop it once real camera frames are accepted:

```bash
export ALTIAIR_HAWKEYE_CAMERA_NODE_ID=altiair-hub
```

## RFID Node B

`altiair-node-b` should run:

```bash
cd /opt/altiair
ALTIAIR_NODE_ID=altiair-node-b \
ALTIAIR_API_PORT=8082 \
ALTIAIR_SENSOR_ADAPTERS=rfid \
ALTIAIR_READER_ID=node-b-rfid \
scripts/pi/install-sensor-adapter-services.sh scripts/pi
```

The RFID adapter supports serial readers and keyboard-wedge HID readers, retries when no reader is visible, and posts `rfid_read` events when tags are scanned.

## UI

From any machine that can reach the Jetson API:

```bash
node ui/server.mjs --port 4173 --host 0.0.0.0 --target http://192.168.42.20:8080
```

Open:

```text
http://192.168.42.20:4173/
```

The UI should show live node API data after `demo:bootstrap` or `hawkeye:feed` posts sensor events.

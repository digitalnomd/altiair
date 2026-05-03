# Teammate Remote Pi and Frontend Handoff

This is the operating handoff for a teammate who needs to work directly with the Pi/Jetson deployment and connect a frontend without physical access to the devices after they are powered on.

## Deployment Shape

Altiair runs as a local CASK edge mesh:

| Node | Hardware | Hostname | Role |
| --- | --- | --- | --- |
| `altiair-hub` | Raspberry Pi 5 | `altiair-hub.local` | Local mission LAN host, display host, queue owner, preferred Foundry/CASK gateway |
| `altiair-node-a` | Raspberry Pi 4 Model B | `altiair-node-a.local` | Camera, microphone, RFID sensor node |
| `altiair-node-b` | Raspberry Pi 4 Model B | `altiair-node-b.local` | Camera, microphone, RFID sensor node |
| `altiair-orin` | Jetson Orin Nano | `altiair-orin.local` | Offline inference node and secondary gateway |

The baseline demo does not require a phone hotspot or venue router. The Pi 5 should create or host the local mission LAN (`Altiair-LAN`), the two Pi 4Bs join it, and the Jetson joins by Wi-Fi or Ethernet. Foundry/CASK sync is queued whenever no gateway has internet.

Foundry connectivity is optional and gateway-only. When a gateway is connected, it can pull governed mission/tag/policy context down and push the local after-action/intelligence record back up to the commander. When disconnected, the local LLM, gossip, coordinator election, deployment leases, and replicated ledger continue without Foundry.

For the current direct Foundry profile, use the gateway node or Mac with the ignored `.env` loaded:

```bash
npm run foundry:direct:intel
npm run foundry:direct:smoke
npm run node:api:foundry -- --node altiair-hub
```

This writes only the current Atlas-supported GPS/location slice and reads the available generated object exports. Full CASK bundle writeback waits on the expanded ontology/action set.

## What Runs On Each Node

Each node runs the same local API shape through `scripts/pi/run-altiair-node.sh`:

```bash
npm run node:api -- --node "$ALTIAIR_NODE_ID" --host 0.0.0.0 --port "$ALTIAIR_API_PORT"
```

Live adapters post camera, microphone, RFID, provider-style location, and health events into:

```text
POST /sensor-events
```

The node merges those events into a CASK bundle, drafts a local LLM insight, creates a controlled training tag objective, builds per-node instructions, records the replicated mission ledger state, and updates the gossip/coordinator surfaces.

The frontend can also start the full demo by posting a mission instruction:

```bash
curl -X POST http://127.0.0.1:18080/mission/deploy \
  -H 'content-type: application/json' \
  --data '{
    "title": "CASK controlled training tag",
    "missionText": "Deploy the Pi and Jetson CASK mesh to collect RFID, microphone, camera, and node-health evidence for a controlled training tag in training-zone-alpha.",
    "objectiveType": "controlled_training_tag",
    "authorizedZoneId": "training-zone-alpha",
    "subjectRef": "training-tag-001",
    "operatorAuthorized": true,
    "requestedBy": "Sarah Hatcher"
  }'
```

That returns a `CaskDeploymentOrder` with one `CaskNodeLease` per node, then `/dashboard` will include `missionInstruction` and `deploymentOrder` for the UI.

Before real sensor adapters are available, use the deterministic mock scenario:

```bash
npm run mock:replay -- --post-url http://127.0.0.1:8080/sensor-events
```

That posts RFID, microphone, Jetson camera, provider-style location, and node-health degradation events through the same `/sensor-events` contract the real adapters will use. For the demo, these feeds can be mocked while the network component stays live. The RFID reader can be real while the location-provider part stays mocked: send tag ID, reader ID, zone, RSSI, optional coarse coordinates, and the fake tactical provider envelope, and the node will mark the derived provider-style fix as non-carrier-grade. The default envelope is `l3harris_tactical_lte_mock` over `wifi_rfid` proximity, not a live vendor or carrier feed.

The local LLM profile is Gemma by default through Ollama-compatible config:

```text
LOCAL_LLM_MODE=ollama
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=gemma4:e2b
```

For the hackathon demo, the simplest reliable configuration is to run Ollama/Gemma on the Mac and point the Pi/Jetson node APIs at the Mac's `Altiair-LAN` IP:

```text
LOCAL_LLM_MODE=ollama
LOCAL_LLM_BASE_URL=http://<mac-altiair-lan-ip>:11434
LOCAL_LLM_MODEL=gemma4:e2b
```

Keep `LOCAL_LLM_MODE=mock` until the approved local runtime is installed on that node. Do not use Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, InternLM, or derivatives.

## Remote Access Without Touching The Pi

Someone still has to image the SD card, insert it, and power the device. After that, the teammate can work over SSH.

1. Prepare the SD card with SSH, hostname, user, and Wi-Fi:

```bash
./scripts/customize_raspberry_pi_sd.sh \
  --boot /Volumes/bootfs \
  --hostname altiair-node-a \
  --username altiair \
  --wifi-ssid Altiair-LAN \
  --ssh-key ~/.ssh/id_ed25519.pub
```

2. Copy the matching node runtime env onto the SD boot partition:

```bash
scripts/pi/write-altiair-sd-env.sh \
  --boot /Volumes/bootfs \
  --env scripts/pi/env/altiair-node-a.env
```

3. Boot the Pi, wait for mDNS, then SSH in:

```bash
ssh altiair@altiair-node-a.local
```

4. On the Pi, clone or update the repo and install the service:

```bash
git clone https://github.com/digitalnomd/altiair.git
cd altiair
scripts/pi/install-altiair-node.sh
```

The installer copies `/boot/firmware/altiair-node.env` or `/boot/altiair-node.env` into `/etc/altiair/altiair-node.env` if present.

## SSH Tunnel For API and UI Work

From the teammate laptop:

```bash
scripts/pi/ssh-tunnel-to-node.sh altiair@altiair-hub.local
```

Defaults:

```text
http://127.0.0.1:18080/dashboard  -> remote node API /dashboard
http://127.0.0.1:14173/           -> remote UI server, if running on the Pi
```

If the UI is running locally on the teammate laptop, point it at the API tunnel:

```bash
ALTIAIR_NODE_API=http://127.0.0.1:18080 node ui/server.mjs --port 4173 --target http://127.0.0.1:18080
```

Then open:

```text
http://127.0.0.1:4173/
```

For the chest-computer path, use the same Pi-hosted UI. Sarah's iPad can mirror or browse to the UI on `Altiair-LAN`; the Motorola should stay unflashed unless the team explicitly needs a separate Android-only client. The frontend should not assume either device is authoritative. It is just a display/acknowledgement surface for the Pi/Jetson CASK mesh.

## Frontend Contract

Use the same-origin UI proxy when possible:

```text
GET /api/dashboard
```

That proxy calls the node API and returns:

```json
{
  "nodeApi": {
    "capturedAt": "2026-05-02T00:00:00.000Z",
    "health": {},
    "topology": {},
    "peers": {},
    "gateway": {},
    "missionContinuity": {},
    "congestion": {},
    "pending": {},
    "ledger": {},
    "replication": {},
    "insight": {},
    "tagPlan": {},
    "missionInstruction": {},
    "deploymentOrder": {},
    "instructions": {}
  }
}
```

A custom frontend should read:

| Field | Use |
| --- | --- |
| `health` | Local node id, role, model status, queue depth, Foundry reachability |
| `topology` / `peers` | Mesh node list, roles, peer observations, online/degraded state |
| `missionContinuity` | Whether local fusion can continue after node or cloud loss |
| `pending` | Latest local CASK bundles from camera, microphone, RFID, and location events |
| `insight` | Local LLM summary, limitations, confidence, and recommended checks |
| `tagPlan` | Controlled training tag objective and per-node assignments |
| `missionInstruction` | Operator-entered mission text, objective, zone, subject/tag reference, requested-by, and policy state |
| `deploymentOrder` | Active deployment state, node leases, startup commands, timeline, and Foundry action plan |
| `foundryIntelligence` | Opportunistic Foundry/OSDK context pull, generated SDK exports, unavailable CASK exports, and commander-sync guidance |
| `foundrySync` | Latest upload acknowledgement and commander-facing mission/evidence summary |
| `instructions` | The current node's local CASK instruction view |
| `gossipWorld` | Online nodes, failed nodes, per-node evidence IDs, and queue/load hints |
| `coordinator` | Current Raft-term singleton coordinator leader, authority state, and per-node directive map |
| `replication` / `ledger` | Evidence that records are replicated across reachable nodes |

The frontend should describe the leader as elected, not fixed. It is normally the best connected or best positioned viable node for the current term, and field roles can still be assigned to a different node if that node owns the relevant RFID/location, camera, or audio evidence.

Minimal frontend fetch:

```js
const response = await fetch("/api/dashboard", { cache: "no-store" });
const { nodeApi } = await response.json();
const localInstruction =
  nodeApi.coordinator?.instructions?.[nodeApi.health?.nodeId] ??
  nodeApi.instructions?.localAssignments?.[0]?.instruction ??
  nodeApi.instructions?.standby ??
  nodeApi.insight?.recommendedNextChecks?.[0] ??
  "Waiting for live sensor evidence.";
```

For direct browser-to-node development, enable CORS on the node API:

```bash
ALTIAIR_CORS_ORIGIN=http://localhost:5173 npm run node:api -- --node altiair-hub
```

If `ALTIAIR_API_TOKEN` is set, send:

```text
Authorization: Bearer <token>
```

Do not commit bearer tokens, Foundry client secrets, registry tokens, private hostnames, or private WireGuard keys.

## API Endpoints

Live frontend and teammate tooling should prefer `/dashboard`, but the lower-level endpoints remain available:

| Endpoint | Purpose |
| --- | --- |
| `GET /dashboard` | Full CASK node snapshot for frontend display |
| `GET /health` | Node status and model status |
| `GET /topology` | Four-node Pi/Jetson mesh shape |
| `GET /peers` | Peer observations |
| `GET /gateway` | Preferred Foundry/CASK gateway selection |
| `GET /mission-continuity` | Local fusion continuity after degraded comms or node loss |
| `GET /gossip/world` | Gossip-derived shared awareness state for frontend and coordinator input |
| `GET /mission/instructions/latest` | Latest operator mission instruction packet |
| `GET /mission/deployment/latest` | Latest deployment order and node leases |
| `GET /mission/timeline` | Auditable deployment timeline |
| `GET /foundry/intelligence` | Pull governed Foundry context when connected; otherwise use cached/mock context |
| `GET /foundry/sync/latest` | Latest commander-sync acknowledgement and mission/evidence summary |
| `GET /stream/topics` | Always-on CASK stream topic definitions |
| `GET /stream/status` | Stream record counts and latest sequence by topic |
| `GET /stream/records` | Stream records for frontend playback; add `?format=kafka` for broker-shaped messages |
| `GET /coordinator/latest` | Current singleton coordinator directive for the active Raft-style term |
| `GET /bundles/pending` | Local queued CASK bundles |
| `GET /ledger` | Local ledger summary |
| `GET /replication/latest` | Latest per-record replication report |
| `GET /insights/latest` | Latest local LLM insight draft |
| `GET /tag-plan/latest` | Latest controlled training tag objective |
| `GET /instructions/latest` | Current node's local instruction view |
| `POST /sensor-events` | Live camera, microphone, RFID, provider-style location, and health ingest |
| `POST /mission/instructions` | Validate and store a mission instruction without activating leases |
| `POST /mission/deploy` | Validate a mission instruction and activate policy-gated node leases |
| `POST /foundry/upload` | Gateway-selected upload/queue for commander visibility |

Mock data contract details are in [Mock CASK Demo Data](mock-cask-demo-data.md).

## CASK and Foundry Status

The repo has a live OSDK path validated against the current Atlas ontology for `[Example] CASK GPS Position`. That supports first writeback smoke tests for RFID-derived provider-style GPS/location fixes.

The full CASK bundle ontology is still represented locally in `src/cask/ontology.ts` and should queue locally until the matching Foundry ontology object/action types exist and are scoped into the generated OSDK package.

## Safety Boundary

The runtime emits evidence-grounded, policy-gated decision support for a controlled training tag scenario. It does not emit engagement planning, target prosecution, capture, pursuit, restraint, autonomous action, or instructions to harm a person.

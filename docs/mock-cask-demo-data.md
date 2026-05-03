# Mock CASK Demo Data

The fastest reliable demo path is deterministic mock sensor data that already matches the live CASK adapter contract. Real camera, microphone, and RFID adapters can replace these events later without changing the node API, local LLM integration, UI proxy, or Foundry writeback boundary.

## Scenario

The built-in scenario is `distributed-training-tag-mock`:

| Step | Mock source | What it proves |
| --- | --- | --- |
| `01-rfid-provider-location` | Pi 4B node B RFID reader | RFID identity plus fake L3Harris-style LTE provider location shape with `isCarrierGrade=false` |
| `02-audio-corroboration` | Jetson USB microphone | Audio context joins the track, but remains inconclusive alone |
| `03-jetson-visual-cue` | Jetson Hawkeye-style visual/track feed | Visual/track evidence completes the current three-node CASK path while Pi 5 is reserved |
| `04-node-loss-continuity` | Optional node health mock | Node B becomes unreachable after replication; the mesh should show degraded continuity while preserving records |

The default mock assumes the Pi 5 is not present yet, so `altiair-hub` is reported as reserved/offline. Pass `--include-pi5` once Ben adds the Pi 5. The optional failure step is disabled by default; pass `--include-failure-step` to rehearse a node-loss segment.

All sensor fixture records are marked `isTestFixture=true`. They are structured exactly like live adapter output:

- `camera_detection`
- `audio_window`
- `rfid_read`
- `node_health`

## Generate Mock Data

Print all steps:

```bash
npm run mock:scenario
```

Print only the latest cumulative event payload:

```bash
npm run mock:scenario -- --format latest-events
```

Print the merged CASK bundle that the node API will derive:

```bash
npm run mock:scenario -- --format bundle
```

Print a compact summary:

```bash
npm run mock:scenario -- --format summary
```

## Replay Against A Running Node

Start the node API:

```bash
ALTIAIR_API_HOST=127.0.0.1 ALTIAIR_API_PORT=8080 npm run node:api -- --node altiair-hub
```

Optionally seed the mission deployment before replay:

```bash
curl -X POST http://127.0.0.1:8080/mission/deploy \
  -H 'content-type: application/json' \
  --data '{
    "title": "CASK controlled training tag",
    "missionText": "Deploy the Pi and Jetson CASK mesh to collect RFID, microphone, camera, and node-health evidence for a controlled training tag in training-zone-alpha.",
    "authorizedZoneId": "training-zone-alpha",
    "subjectRef": "training-tag-001",
    "operatorAuthorized": true,
    "requestedBy": "Sarah Hatcher"
  }'
```

Replay the four mock steps:

```bash
npm run mock:replay -- --post-url http://127.0.0.1:8080/sensor-events
```

Replay continuously with current timestamps:

```bash
npm run mock:replay -- --post-url http://127.0.0.1:8080/sensor-events --live-clock --loop --delay-ms 5000
```

Run the Hawkeye-style online/mock feed:

```bash
npm run hawkeye:feed -- --post-url http://127.0.0.1:8080/sensor-events --interval-ms 10000
```

Use deterministic-only mode if venue internet is unreliable:

```bash
ALTIAIR_HAWKEYE_SOURCE=mock npm run hawkeye:feed -- --post-url http://127.0.0.1:8080/sensor-events
```

On a Pi using `/etc/altiair/altiair-node.env`:

```bash
scripts/pi/replay-mock-scenario.sh
```

Then inspect:

```bash
curl -sS http://127.0.0.1:8080/dashboard
curl -sS http://127.0.0.1:8080/insights/latest
curl -sS http://127.0.0.1:8080/tag-plan/latest
curl -sS http://127.0.0.1:8080/instructions/latest
curl -sS http://127.0.0.1:8080/gossip/world
curl -sS http://127.0.0.1:8080/coordinator/latest
curl -sS http://127.0.0.1:8080/mission/deployment/latest
curl -sS http://127.0.0.1:8080/mission/timeline
curl -X POST http://127.0.0.1:8080/foundry/upload
curl -sS http://127.0.0.1:8080/foundry/sync/latest
curl -sS http://127.0.0.1:8080/mission-continuity
```

Expected result:

- `/dashboard` has one latest `nodeApi` snapshot with CASK bundle, insight, tag plan, instructions, gossip world, singleton coordinator directive, replication, and continuity.
- `/insights/latest` returns the local LLM path output. In `LOCAL_LLM_MODE=mock`, this is deterministic. In `LOCAL_LLM_MODE=ollama`, it uses the configured approved local model.
- `/tag-plan/latest` returns a controlled non-contact training tag objective.
- `/instructions/latest` returns the current node's local instruction view.
- `/gossip/world` reports `altiair-hub` as reserved/offline until `--include-pi5` is used. If `--include-failure-step` is used, it also reports `altiair-node-b` as failed after the final mock step and keeps replicated records available.
- `/coordinator/latest` reports the current Raft-style singleton coordinator leader, term, authority state, and per-node instruction map.
- `/mission/deployment/latest` reports the active mission deployment order and node leases for Pi 5, the two Pi 4Bs, and Jetson.
- `/mission/timeline` reports instruction receipt, policy check, lease assignment, and activation events.
- `/foundry/upload` and `/foundry/sync/latest` show the commander-sync package. In mock mode it is queued; in connected OSDK mode it writes the available CASK profile.
- `/mission-continuity` reports the current three-node state by default and reports degraded state when `--include-failure-step` mocks `altiair-node-b` unreachable.

## Mock-To-Real Swap

The real adapters only need to emit the same event kinds:

```json
{
  "events": [
    {
      "kind": "rfid_read",
      "sourceNodeId": "altiair-node-b",
      "readerId": "node-b-rfid",
      "tagId": "training-tag-001",
      "zoneId": "training-zone-alpha",
      "rssi": -41,
      "providerStyle": {
        "sourceId": "l3harris-style-lte-mock-from-rfid-b",
        "entityId": "training-tag-001",
        "precisionRadiusMeters": 35,
        "providerName": "L3Harris-style tactical LTE mock",
        "emulationProfile": "l3harris_tactical_lte_mock",
        "transport": "wifi_rfid",
        "networkId": "altiair-private-lte-mock",
        "cellId": "mock-cell-training-alpha",
        "sectorId": "sector-a",
        "accessPointId": "altiair-lan-ap",
        "verificationMethod": "rfid_wifi_proximity",
        "isSimulated": true
      }
    }
  ]
}
```

The RFID reader can be real while the provider-style location feed remains mocked. Emit the reader's tag ID, reader ID, zone, RSSI, optional coarse coordinates, and provider-style envelope fields; `src/sensors/liveMerge.ts` will create the CASK `RfidEvent`, `ProviderStyleLocationEvent`, and `LocationFix` records with `isCarrierGrade=false`. The default envelope is an L3Harris-style tactical LTE mock using RFID/Wi-Fi proximity, not a live carrier or vendor integration.

No frontend or ontology code changes are required when the mock emitters are replaced by real Pi/Jetson capture processes.

## Safety Boundary

The mock data represents a controlled training tag workflow. It exists to prove evidence fusion, local continuity, policy gates, and per-node display instructions. It does not produce engagement, pursuit, capture, or harm instructions.

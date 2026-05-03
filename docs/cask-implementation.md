# CASK Edge Implementation

This repo now includes a runnable local scaffold for the CASK edge path:

- Typed sensor, cue, node-health, and insight contracts in `src/cask/types.ts`.
- A sample Pi sensor bundle in `src/cask/sampleBundle.ts`.
- A live sensor merge boundary in `src/sensors/liveMerge.ts`.
- Deterministic demo-shaped sensor data in `src/mock/caskDemoScenario.ts`.
- A local insight adapter in `src/llm/localInsight.ts`.
- Gossip world state and singleton coordinator directives in `src/mesh/coordinator.ts`.
- Mission instruction, policy decision, deployment order, node lease, and timeline records in `src/cask/missionDeployment.ts`.
- A Foundry OSDK uploader in `src/foundry/uploader.ts`.
- A Foundry OSDK read-side intelligence connector in `src/foundry/intelligence.ts`.
- A smoke runner in `src/scripts/smoke.ts`.

The smoke runner defaults to mock Foundry and mock LLM mode for local tests, so it can run without secrets:

```bash
npm install
npm run smoke:mock
```

## Live Sensor Merge Boundary

Camera, microphone, and RFID adapters should emit small JSON events instead of building full CASK bundles themselves. The node can merge live Pi/Nano adapter events through:

```bash
npm run sensor:merge -- --input ./local-sensor-events.json
```

or by posting directly to a running node:

```bash
curl -X POST http://127.0.0.1:8080/sensor-events \
  -H 'content-type: application/json' \
  --data @./local-sensor-events.json
```

Accepted event kinds are `camera_detection`, `audio_window`, `rfid_read`, and `node_health`. RFID reads automatically produce both a `RfidEvent` and a coarse `ProviderStyleLocationEvent`/`LocationFix` with `isCarrierGrade=false`. That is the intended mock boundary: the reader can be real, while the carrier-style location provider is represented by reader ID, zone, RSSI, optional coordinates, freshness, precision radius, and a fake L3Harris-style tactical LTE envelope until a real provider feed exists. Drone-class camera detections produce `DroneObservation` records. Camera/RFID correlation produces a policy-gated cue for human review.

For the best demo, mock the sensor and provider feeds but keep the network component live: nodes should actually heartbeat, gossip, replicate records, elect a coordinator, and survive node/display/cloud loss. The local LLM should run on the Mac through the same Ollama-compatible API used by the Pi/Jetson target runtime, e.g. point nodes at `LOCAL_LLM_BASE_URL=http://<mac-altiair-lan-ip>:11434`. Modal/OpenAI are optional fallback tools for later experiments, not dependencies for the demo.

## Always-On Stream Spine

`src/stream/alwaysOn.ts` turns each accepted CASK bundle into Kafka-shaped records even when no broker is running. This is the integration layer judges should see as "always on": sensor events, location fixes, node health, policy-gated cues, Gemma/local-LLM insight drafts, coordinator directives, and Foundry sync acknowledgements all share one append-only envelope.

Node API surfaces:

```text
GET /stream/topics
GET /stream/status
GET /stream/records?after_sequence=0&limit=100
GET /stream/records?topic=altiair.cask.location.v1
GET /stream/records?format=kafka
```

Brokerless mode is the default demo path. The node keeps a bounded local stream window, defaulting to the latest 2,000 records via `ALTIAIR_STREAM_RETENTION`. If a Kafka broker or Foundry streaming connector is available, forward each record as `{ topic, key, value, headers }` from `toKafkaMessage(record)` or request `GET /stream/records?format=kafka` without changing CASK payloads.

Web-checked implementation fit on 2026-05-03:

- Palantir OSDK docs support treating Foundry as the backend for high-scale ontology queries, Foundry edits, and governance controls: https://www.palantir.com/docs/foundry/ontology-sdk-react-applications/overview/
- Palantir Streams are structured, low-latency records with hot/cold storage, per-row processing, partitioning, and checkpointing: https://www.palantir.com/docs/foundry/data-integration/streams
- Palantir's Kafka connector reads Kafka queues into Foundry streams in realtime and preserves key/value message shape: https://www.palantir.com/docs/foundry/available-connectors/kafka
- Apache Kafka's event model is a topic-organized stream of events with key, value, timestamp, and optional headers: https://kafka.apache.org/intro/
- Google Gemma docs list local/edge execution paths including Ollama and llama.cpp; keep `gemma3:1b` as the stable Pi/Mac demo default unless the installed runtime has a newer approved Gemma build: https://ai.google.dev/gemma/docs

Run:

```bash
npm run stream:smoke
```

`POST /sensor-events` and `POST /bundles` also run the configured local insight client on the receiving node. The response includes the local LLM mode/model, the generated `InsightDraft`, the CASK training tag objective summary, this node's local instruction view, and the latest singleton coordinator summary. `GET /insights/latest`, `GET /tag-plan/latest`, `GET /instructions/latest`, `GET /gossip/world`, and `GET /coordinator/latest` return those latest runtime products.

All four compute nodes are modeled as local-LLM capable: the two Pi 4B sensor nodes, the Pi 5 hub/display/gateway, and the Jetson Orin Nano inference node.

## Mission Instructions And Deployment

Use the mission deployment endpoint to start the demo from an operator instruction:

```bash
curl -X POST http://127.0.0.1:8080/mission/deploy \
  -H 'content-type: application/json' \
  --data '{
    "title": "CASK controlled training tag",
    "missionText": "Deploy the Pi and Jetson CASK mesh to collect RFID, microphone, camera, and node-health evidence for a controlled training tag in training-zone-alpha. Share the fused cue to all reachable edge nodes and keep Foundry writeback queued until policy and connectivity allow it.",
    "objectiveType": "controlled_training_tag",
    "authorizedZoneId": "training-zone-alpha",
    "subjectRef": "training-tag-001",
    "operatorAuthorized": true,
    "requestedBy": "Sarah Hatcher"
  }'
```

The endpoint returns a `CaskDeploymentOrder` with:

- policy decision and blocked/review reasons;
- one node lease per Pi/Jetson node;
- startup command and required API endpoints for each node;
- sensor event kinds expected from each node;
- mission timeline events for instruction receipt, policy check, lease assignment, and deployment activation.

Read the result through:

```text
GET /mission/instructions/latest
GET /mission/deployment/latest
GET /mission/timeline
GET /dashboard
```

Run the deterministic check:

```bash
npm run mission:smoke
```

The policy gate blocks harmful or operational attack language before node leases are assigned. Accepted deployment output is limited to evidence collection, local fusion, gossip, coordinator election, display, relay, queueing, and policy-gated Foundry writeback.

## Gossip And Singleton Coordinator

Every node can locally merge sensor evidence and draft a bounded local insight. Nodes then gossip health, latest evidence, queue/load, and reachability into a shared world state. The coordinator layer uses that world state to elect one active coordinator LLM for the current Raft-style term.

The election is intentionally practical: choose the best connected or best positioned viable coordinator candidate. Link class, packet loss, latency freshness, queue depth, CPU, memory pressure, gateway/display roles, local LLM availability, current evidence ownership, and task assignment all contribute to the score. This is separate from field role assignment, where the selected node is usually the one best positioned for the training tag/checkpoint role.

The active coordinator publishes one `CaskCoordinatorDirective` containing:

- the elected `leaderId`, term, quorum size, candidate list, and authority state;
- the latest `CaskGossipWorldState`, including online and failed nodes;
- a policy-gated recommended next action;
- per-node instruction text for the surviving online nodes;
- constraints that reject stale terms and non-leader coordinator outputs.

If quorum is lost, `/coordinator/latest` reports `no_quorum_observe_only`; nodes continue local sensing, evidence preservation, and gossip, but should not accept new coordinator instructions until quorum returns.

## Mock Data Replay

Use the built-in mock scenario to prove the whole integration path before hardware adapters are attached:

```bash
npm run mock:scenario -- --format summary
npm run mock:scenario -- --format latest-events
npm run mock:scenario -- --format bundle
```

Replay the scenario against a running node:

```bash
npm run mock:replay -- --post-url http://127.0.0.1:8080/sensor-events
```

The four replay steps emit RFID/provider-style location, audio, Jetson camera detection, and node-health degradation. The final dashboard snapshot should contain the CASK bundle, local LLM insight, controlled training tag plan, node-local instructions, replication report, and degraded mission-continuity state.

See [Mock CASK Demo Data](mock-cask-demo-data.md) for the exact mock-to-real adapter contract.

## Foundry OSDK Setup

Create a Developer Console backend-service application for the Pi-side daemon. The Palantir OSDK backend-service flow uses a confidential OAuth client, `@osdk/client`, `@osdk/oauth`, the Foundry stack URL, and the Ontology RID.

Required local environment values:

```bash
export FOUNDRY_MODE=osdk
export FOUNDRY_API_URL="https://<your-foundry-stack>.palantirfoundry.com"
export FOUNDRY_ONTOLOGY_RID="ri.ontology.main.ontology.<your-ontology-rid>"
export FOUNDRY_CLIENT_ID="<client-id>"
export FOUNDRY_CLIENT_SECRET="<client-secret>"
export FOUNDRY_OSDK_PACKAGE="<generated-osdk-package-name>"
```

Install the generated OSDK package after configuring a local `.npmrc` from the Developer Console package registry. Keep tokens local, and avoid saving the generated package or private tarball path into Git:

```bash
export FOUNDRY_TOKEN="<developer-console-token>"
npm install --no-save <generated-osdk-package-name>@latest
```

If Atlas provides a downloaded package tarball instead of registry install, use the same no-save pattern, for example `npm install --no-save ~/Downloads/@cask-edge-service_sdk-0.1.0.tgz`.

Then run:

```bash
npm run smoke:foundry
```

## Foundry Intelligence Pull

Foundry is used only when a gateway node is connected. The local LLM and gossip/coordinator path remain decentralized during DDIL; Foundry provides governed context on the way in and commander visibility on the way back out.

Read governed context through:

```bash
curl -sS "http://127.0.0.1:8080/foundry/intelligence?refresh=true&page_size=10"
```

In `FOUNDRY_MODE=osdk`, this uses the generated OSDK object exports listed in `FOUNDRY_INTEL_OBJECT_EXPORTS`. The current generated package exposes `ExampleCaskGpsPosition`; after ontology expansion, add the full CASK exports such as `CaskMission`, `CaskMissionInstruction`, `CaskDeploymentOrder`, `CaskSensorObservation`, `CaskLocationFix`, `CaskCoordinatorDirective`, and `CaskInsightDraft`.

The endpoint returns a commander/mission-context snapshot:

- retrieved Foundry records with payload JSON and summaries;
- generated object/action exports visible in the SDK package;
- object exports that are unavailable until the ontology resources are added;
- local uses: cache context for DDIL, resolve RFID tags, cite Foundry object IDs, and queue what happened back to the commander when connected.

Local validation:

```bash
npm run foundry:intel:smoke
```

To push what happened back up when a gateway is connected, post the latest bundle and local insight:

```bash
curl -X POST http://127.0.0.1:8080/foundry/upload
curl -sS http://127.0.0.1:8080/foundry/sync/latest
```

In mock mode this returns a queued commander-sync package. In OSDK mode, the existing upload profile controls the direct write: `cask_gps_position` writes the currently available GPS/location slice, while `bundle_actions` writes the full bundle once the matching CASK actions exist.

Current Atlas status is tracked in [Foundry Atlas Status](foundry-atlas-status.md). The visible hackathon ontology currently supports a narrow live smoke through `[Example] CASK GPS Position`; it does not yet expose the full CASK bundle ontology.

## Expected Foundry Action Contract

Choose the upload profile first:

- `FOUNDRY_UPLOAD_PROFILE=bundle_actions`: full local CASK contract, for when the ontology has matching typed actions.
- `FOUNDRY_UPLOAD_PROFILE=cask_gps_position`: current Atlas-compatible smoke profile that writes only `LocationFix` records to `[Example] CASK GPS Position`.

Until we lock the exact ontology action parameter names in Foundry, the uploader supports two payload styles:

- `json` default: each action receives `{ externalId, sourceNodeId, observedAt, policyState, payloadJson }`.
- `raw`: each action receives the full typed object directly.

The current default action export names are:

| Purpose | Env override | Default generated export |
| --- | --- | --- |
| Mission instructions | `FOUNDRY_ACTION_CREATE_MISSION_INSTRUCTION` | `createCaskMissionInstruction` |
| Policy decisions | `FOUNDRY_ACTION_CREATE_POLICY_DECISION` | `createCaskPolicyDecision` |
| Deployment orders | `FOUNDRY_ACTION_CREATE_DEPLOYMENT_ORDER` | `createCaskDeploymentOrder` |
| Node leases | `FOUNDRY_ACTION_UPSERT_NODE_LEASE` | `upsertCaskNodeLease` |
| Mission timeline events | `FOUNDRY_ACTION_CREATE_MISSION_TIMELINE_EVENT` | `createCaskMissionTimelineEvent` |
| Sensor events | `FOUNDRY_ACTION_CREATE_SENSOR_OBSERVATION` | `createCaskSensorObservation` |
| Location fixes | `FOUNDRY_ACTION_CREATE_LOCATION_FIX` | `createCaskLocationFix` |
| Counter-UAS cues | `FOUNDRY_ACTION_CREATE_COUNTER_UAS_CUE` | `createCaskCounterUasCue` |
| Gossip world state | `FOUNDRY_ACTION_CREATE_GOSSIP_WORLD_STATE` | `createCaskGossipWorldState` |
| Coordinator directives | `FOUNDRY_ACTION_CREATE_COORDINATOR_DIRECTIVE` | `createCaskCoordinatorDirective` |
| Insight drafts | `FOUNDRY_ACTION_CREATE_INSIGHT_DRAFT` | `createCaskInsightDraft` |
| Node health | `FOUNDRY_ACTION_UPSERT_NODE_HEALTH` | `upsertCaskNodeHealth` |
| CASK GPS Position smoke | `FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION` | `createExampleCaskGpsPosition` |

If the hackathon ontology already has action names with different API names, set the env overrides instead of changing code.

## Local LLM Setup

The LLM adapter supports:

- `LOCAL_LLM_MODE=mock`: deterministic local explanation for tests and missing-model development only.
- `LOCAL_LLM_MODE=ollama`: sends the compact CASK bundle to an Ollama-compatible `/api/chat` endpoint.

Example:

```bash
export LOCAL_LLM_MODE=ollama
export LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
export LOCAL_LLM_MODEL=gemma3:1b
npm run smoke:mock
```

Project policy blocks Chinese-origin model family names, including Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, and InternLM.

## Safety Boundary

The code intentionally emits evidence-backed, policy-gated cue packages. It does not generate engagement plans, target prosecution, capture instructions, or autonomous action recommendations. Recommended checks are limited to verification, sensor repositioning, coverage, deconfliction, and human review.

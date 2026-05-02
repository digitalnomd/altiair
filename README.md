# Altiair

Hackathon planning and implementation repo for a Palantir CASK edge system that uses Foundry OSDK data, Raspberry Pi sensor nodes, and a local LLM to produce evidence-grounded mission insight drafts in unreliable network environments.

Project lead: Sarah Hatcher.

Team inputs merged here:

- Sarah/Codex CASK OSDK + local LLM plan.
- `origin/main` edge mesh and iPad operator README.
- `readme-ben.md` hackathon execution draft.

The current decision brief is here:

- [CASK OSDK and Local LLM Brief](docs/cask-osdk-local-llm-brief.md)

Shared data ideas and LLM context drop:

- [National Security Hackathon - Altiair shared Google Drive](https://drive.google.com/drive/folders/1hRTFxmv2g1PxKLg1U8fvUuWTxWWHIGql?usp=sharing)

Use the Drive for team data ideas, mock fixtures, diagrams, sensor notes, evaluation prompts, and context documents we may later ingest into a local RAG/LLM context pipeline. Do not upload credentials, private Foundry URLs, client secrets, uncontrolled raw media, or sensitive personal data.

## Merged Source Insights

What all three README drafts agree on:

- The core product is resilient edge sensing for DDIL or unreliable network environments.
- Raspberry Pis collect camera, microphone, RFID, and telemetry events.
- Local state must keep working when cloud connectivity drops.
- Foundry/CASK provides governed mission context, ontology mapping, enrichment, and writeback.
- A local LLM or deterministic fallback produces structured operator-facing summaries.
- A Pi-built or chest-worn display shows node health, observations, alerts, and fused context.
- Human review stays in the loop for any consequential output.

What differed across the drafts, and the merged decision:

| Topic | Difference | Merged direction |
| --- | --- | --- |
| Project spelling | Ben's draft says `Altair`; repo, Drive, and PR use `Altiair`. | Keep `Altiair` unless the full team renames the repo and shared assets. |
| Hardware | One draft assumed 3x Pi 4B; Sarah confirmed 2x Pi 4B and 1x Pi 5. | Use 2x Pi 4B edge nodes and 1x Pi 5 hub candidate. |
| Topology | One draft used peer mesh; Ben's draft used Pi 5 hub + phones on a local LAN. | MVP uses Pi 5 as hub/gateway on a local LAN, with Pi 4B nodes doing edge capture and store-and-forward. Peer-to-peer mesh remains a stretch path. |
| Foundry integration | Sarah's plan targets OSDK; Ben's draft says raw REST for v1. | OSDK is the target CASK path. REST/mock uploader is allowed as a day-one fallback if OSDK setup blocks the demo. |
| Operator UI | Drafts mention iPad, phones, PWA, Army AR, and now EagleEye. | Build a Pi-hosted EagleEye-style display shell first. Phones are only a fallback browser, not the primary demo device. |
| LLM default | Drafts mention Granite, Llama, Gemma, Phi, and SmolLM. | Benchmark non-Chinese small models on Pi 5 first; use deterministic rules if latency misses the demo window. |
| Scope | Ben's draft explicitly excludes kill-chain automation; Sarah's plan narrows target language; Army feedback sharpened the counter-UAS "find target" story. | Frame the demo as counter-UAS detection, attribution, and policy-gated cueing. Do not build autonomous target prosecution or harmful engagement instructions. |

Open decisions:

- Final project spelling: `Altiair` versus `Altair`.
- Whether the first Foundry path is generated OSDK, REST, or mock uploader.
- Which model wins on Pi 5 latency and JSON reliability.
- Whether the demo UI runs on a Pi-attached display, Pi-hosted kiosk browser, or a separate chest-worn compute/display rig.
- Which CASK kit capabilities are available during the hackathon.
- Whether the external-alignment slide says Army NGC2 only, or also names Anduril EagleEye, Lattice, and Lockheed Martin C2 systems as interoperability research targets.

## Goal

Build a local CASK edge layer that can:

- Pull governed mission context from Foundry through the OSDK.
- Ingest camera, microphone, and RFID signals from Pi 4B and Pi 5 nodes.
- Mock provider-style LTE/RF location telemetry using the Arduino RFID kit.
- Fuse deterministic sensor events before invoking any LLM.
- Use a local non-Chinese model family to draft structured insights with citations.
- Broadcast high-confidence evidence updates to edge nodes and operator devices.
- Write approved events, insight drafts, node health, and operator decisions back to Foundry.
- Support a counter-UAS demo path that detects low-cost drone activity, correlates the likely operator/control source from evidence, and creates a human-reviewed cue package.

## Demo Scenario

The demo is an edge-node mesh for a controlled training environment. Operators carry or use Pi-backed nodes with RFID readers plus camera and microphone inputs. Those nodes share structured observations with each other, use RFID reads to estimate the location of a tagged training subject or tagged asset, and surface a shared operating picture on a Pi-built EagleEye-style display shell, Pi-attached screen, or chest-worn field computer. A phone browser can remain an emergency fallback, but it is not the primary concept.

The real-world pattern being mocked is provider-style RF/LTE location telemetry: an external network can report a location estimate for a device or tag. For this demo, we do not have carrier-grade granularity. We will use an Arduino RFID kit to generate structurally similar location events, then mark them with explicit source, precision, confidence, freshness, and mock status fields.

The CASK-backed omni-model should fuse the sensor streams into a local, evidence-grounded view:

- RFID provides the primary identity or presence signal.
- Mock provider-style location events provide the LTE/RF location shape we expect CASK to consume later.
- Camera events provide visual confirmation, movement, zone, and scene context.
- Microphone events provide transcripts, acoustic events, and local context.
- Foundry/OSDK provides governed mission context, asset/person/tag mappings, permissions, and writeback.
- The local LLM explains the fused picture, calls out uncertainty, and recommends non-kinetic coordination steps such as coverage, search, deconfliction, sensor repositioning, and next verification checks.

This repo should not encode instructions for harming, capturing, or attacking a real person. Any "target" language in demos should mean an authorized, tagged training subject or simulated entity.

## Counter-UAS Cueing Use Case

Army feedback sharpened the "find target" story into a counter-UAS workflow:

1. Detect an operator-controlled or low-cost drone event.
2. Classify the drone class in the map layer, for example DJI-style commercial quadcopter, Shahed-style low-cost one-way drone, decoy drone, or unknown.
3. Correlate camera, microphone, RFID/mock-provider location, operator reports, and Foundry context to estimate a likely control source, launch area, or operator-associated zone.
4. Produce an evidence queue for a human operator: what was observed, where, confidence, freshness, source sensors, contradictions, and policy state.
5. Cue the operator display and edge nodes with a `CounterUasCue`, not an engagement order.
6. Keep every consequential action behind rules of engagement, policy review, command authorization, and human acknowledgement.

The system should replace harmful engagement wording with "surface an evidence-backed counter-UAS cue to authorized C2 workflows." The demo can show the queue and policy gate; it should not recommend lethal action, targeting procedures, or autonomous engagement.

Map layers for this use case:

- Drone observations by class, confidence, altitude/zone when available, and timestamp.
- Likely control-source or launch-area estimate with confidence ring and freshness.
- Sensor coverage and blind spots.
- Decoy or spoof suspicion when observations conflict.
- Policy status: collect-only, review-needed, authorized-to-share, or blocked.
- CASK/Foundry sync state and last acknowledgement.

Demo phrasing:

- "Find the drone operator" means estimate and explain an attributable control-source zone from sensor evidence.
- "Queue" means an evidence and policy review queue for a human operator.
- "Unjammable" should be presented as jam-resilient or DDIL-resilient; do not claim a system is literally unjammable.
- A Faraday bag/cage remains a demo beat for local resilience: isolate one display client or cloud path and show the Pi/CASK edge still queues, syncs, and informs nearby operators.
- "EagleEye integration" means the Pi-hosted display should emulate the cue overlays and acknowledgement flow we would later publish into a headborne C2 display; the MVP should not claim direct EagleEye access unless we actually receive it.

## Hardware Inventory

Confirmed demo hardware:

| Quantity | Equipment | Role |
| --- | --- | --- |
| 2 | Raspberry Pi 4 Model B | Edge sensor nodes for camera, microphone, RFID, local event extraction, and store-and-forward. |
| 1 | Raspberry Pi 5 | Hub candidate for FastAPI gateway, SQLite queue, local LLM runtime, WebSocket fanout, and Foundry/CASK sync. |
| 1+ | Arduino RFID kit / RFID readers | Mock provider-style location and tag presence events. |
| 1+ | Camera inputs | Visual observations through Pi camera or USB camera. |
| 1+ | Microphone inputs | Voice activity, transcript, acoustic event, or note capture. |
| 1+ | Pi-attached display, wearable display shell, or chest computer | Operator display through Pi-hosted EagleEye-style UI. |
| 1 | Travel router or local AP | Closed LAN for Pis and fallback viewers; AP isolation must be off. |

## MVP Architecture

```mermaid
flowchart LR
  subgraph Foundry["Tier 3: Palantir Foundry / CASK"]
    Ontology["Ontology objects and actions"]
    AIP["AIP / enrichment logic"]
    Workshop["Workshop or dashboard"]
  end

  subgraph Hub["Tier 2: Raspberry Pi 5 hub"]
    API["FastAPI gateway"]
    DB["SQLite durable queue"]
    LLM["Local LLM or rules"]
    Uploader["OSDK sync / REST fallback / mock uploader"]
    Fanout["WebSocket fanout"]
  end

  subgraph Edge["Tier 1: Raspberry Pi 4B edge nodes"]
    NodeA["altiair-node-a\ncamera + mic + RFID"]
    NodeB["altiair-node-b\ncamera + mic + RFID"]
    Queue["local bundle store"]
  end

  subgraph UI["Operator devices"]
    PWA["Pi-hosted UI\nEagleEye-style cue emulator"]
    EagleEye["Future EagleEye / headborne C2 display"]
  end

  NodeA --> Queue
  NodeB --> Queue
  Queue --> API
  API --> DB
  DB --> LLM
  DB --> Uploader
  Uploader --> Ontology
  Ontology --> AIP
  AIP --> Workshop
  AIP --> Uploader
  Uploader --> DB
  Fanout --> PWA
  Fanout -.-> EagleEye
  DB --> Fanout
```

Recommended day-one topology:

- Closed LAN through a travel router with AP isolation off.
- `altiair-node-a` and `altiair-node-b` are Pi 4B edge nodes.
- `altiair-hub` is the Pi 5 gateway and local LLM host.
- The primary operator display is built off the Pi: attached screen, kiosk browser, or chest-worn compute/display rig that resembles EagleEye cueing.
- Phones and tablets are fallback viewers only.
- Use `mkcert` or equivalent local TLS if mobile browsers need camera or microphone access.
- Use static peer configuration first; automatic discovery, libp2p, Wi-Fi Direct, or MANET behavior are stretch goals.

## Workstreams

| Lane | Owner | Owns | First output |
| --- | --- | --- | --- |
| Backend / Pi | TBD | `pi/` | FastAPI scaffold, healthcheck, SQLite queue, bundle API. |
| Frontend / Pi-hosted UI | TBD | `web/` | EagleEye-style display shell, service worker or kiosk mode, reconnecting WebSocket client. |
| Foundry / CASK / OSDK | Sarah / Rob lead | `foundry/` | Ontology sketch, OSDK package path, REST/mock fallback. |
| Sensor pipeline | TBD | `sensors/` | Camera, microphone, RFID adapters emitting normalized events. |
| Networking + demo | Ben lead | `demo/` | Router config, local TLS, smoke test, rehearsal script. |

### Backend / Pi

- FastAPI service with `GET /health`.
- SQLite metadata store plus filesystem blob references.
- Bundle state machine: `pending`, `forwarded`, `uploading`, `uploaded`, `failed`.
- WebSocket fanout to operator UI.
- Deterministic fusion rules before LLM invocation.
- Ollama or llama.cpp-compatible local model runtime when latency allows.

### Frontend / Pi-Hosted UI

- Pi-hosted responsive UI or kiosk app that can render on an attached display, browser, or chest-worn compute shell.
- EagleEye-style cue overlay: compact status ribbon, confidence ring, evidence drawer, policy gate, and acknowledgement control.
- Mesh health view: nodes online, hub/gateway, peer quality, pending upload counts.
- Observation feed: timestamp, source node, sensor type, media preview, upload status.
- Map or zone view with pre-cached tiles if map time permits.
- Alert/detail pane with evidence, uncertainty, and acknowledgement action.
- Degraded/offline state when Foundry is unreachable but local mesh data is still available.

### Foundry / CASK / OSDK

Decide or gather:

- Foundry stack URL, Ontology RID, generated OSDK package name, and package index URL.
- Developer Console app shape for `cask-edge-service`.
- OAuth grant path and service-user permissions.
- Object types for missions, assets, sensors, cameras, microphones, RFID readers, RFID tags, location feeds, edge nodes, observations, alerts, and tasks.
- Actions/writeback targets for camera events, audio events, RFID events, mock provider location events, insight drafts, node health, incident annotations, operator decisions, and action logs.
- Counter-UAS object/action candidates: `DroneObservation`, `DroneTrack`, `CounterUasCue`, `ControlSourceEstimate`, `PolicyGate`, `EvidenceQueueItem`, and `OperatorAcknowledgement`.

Day-one fallback:

- If OSDK setup blocks the demo, use a narrow REST or mock uploader behind the same local endpoint.
- Keep the integration boundary stable: `POST /foundry/upload` returns deterministic acknowledgement receipts.

### Sensor Pipeline

Initial event contracts:

- `CameraEvent`: camera ID, detection class, bounding region, confidence, frame time, optional thumbnail reference, retention policy.
- `AudioEvent`: microphone ID, VAD window, transcript, ASR confidence, keyword/acoustic class, optional redacted audio reference.
- `RfidEvent`: reader ID, tag ID, antenna/zone, RSSI if available, read count, timestamp, matched Foundry reference.
- `MockProviderLocationEvent`: simulated LTE/RF-provider-style location fix generated from the Arduino RFID kit, with source type, mock flag, zone/coordinate, precision radius, confidence, and freshness.
- `LocationFix`: normalized location estimate from RFID, mock provider telemetry, camera, microphone, or manual input.
- `Anomaly`: deterministic rule ID, threshold, score, related observations.
- `InsightDraft`: LLM explanation, evidence references, confidence, limitations, recommended next check.
- `TrackEstimate`: tracked subject/asset ID, last known zone, confidence, supporting RFID/camera/audio events, freshness, and conflict markers.
- `DroneObservation`: drone class, detection source, zone or bearing, confidence, media reference, and timestamp.
- `ControlSourceEstimate`: likely controller or launch area estimate, supporting observations, contradictions, confidence ring, freshness, and policy state.
- `CounterUasCue`: human-reviewed cue package linking drone observations, control-source estimate, evidence, confidence, policy gate, and acknowledgement state.
- `NodePing`: event notification sent to edge nodes when a track estimate crosses confidence or urgency thresholds.

Processing granularity:

- Each node extracts local events before sending data across the mesh.
- Camera frames become detections, thumbnails, or short clips only when policy allows.
- Microphone streams become voice-activity windows, transcripts, and acoustic labels.
- RFID reads are deduplicated, timestamped, and joined to known tags.
- Arduino RFID reads also emit mock provider-style location events so downstream CASK logic can use the shape of future LTE/RF location telemetry.
- All location estimates must carry `source`, `precision`, `confidence`, `freshness`, and `isMock` fields.
- The hub reconciles conflicting observations and produces track estimates with freshness and confidence.
- The LLM consumes compact evidence bundles, not continuous raw sensor streams.
- Counter-UAS outputs must stop at evidence-backed cueing, policy status, and recommended verification checks.

### Interoperability / External Alignment

Keep the MVP self-contained, but align the language with current Army and defense C2 direction:

- Army Next Generation Command and Control (NGC2): use this as the external framing for data-centric C2, integrated transport/data/app layers, and resilient operator decision support.
- Anduril EagleEye: target display metaphor for headborne mission command, digital vision, and AI-assisted situational awareness. Treat the Pi-hosted UI as a stand-in until there is real EagleEye/Lattice access.
- Anduril Lattice: research as an interoperability reference because its public developer docs expose entity, task, and object API concepts for C2/situational-awareness integrations.
- Lockheed Martin C2/BMC systems: research as another interoperability reference for command-and-control decision support and cross-domain battle management.
- Army AR / chest display: treat as the future operator-interface target; the MVP remains a Pi-hosted UI that can run on an attached display, kiosk browser, or chest-worn compute/display rig.
- Beyond-line-of-sight communications: capture as a stretch transport layer requirement. The demo should prove local DDIL resilience first, then document BLOS options as integration candidates.
- Maritime or sea-warfare extension: keep as a scenario variant using the same sensor bundle, drone observation, cueing, and policy-gate schema.

Potential EagleEye/Lattice adapter boundary:

- Publish `DroneObservation` and `ControlSourceEstimate` as map/display entities.
- Store evidence media or thumbnails as object references.
- Publish `CounterUasCue` as a review task or cue item requiring acknowledgement.
- Keep policy state attached to every cue so the display cannot imply authorization that the backend has not granted.
- Keep engagement controls out of the MVP adapter. Display only evidence, confidence, policy state, and verification prompts.

## Node API Contract

Every node or gateway should expose the same minimal API so workstreams can integrate quickly:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Returns node id, uptime, service status, and local clock. |
| `GET /peers` | Returns known peers and last heartbeat status. |
| `GET /gateway` | Returns current gateway candidate and score. |
| `POST /bundles` | Receives a sensor bundle from local capture or another Pi. |
| `GET /bundles/pending` | Lists bundles that still need forwarding or upload. |
| `POST /bundles/{bundle_id}/ack` | Records Foundry upload acknowledgement. |
| `POST /foundry/upload` | Uploads a bundle when this node is the selected gateway. |
| `GET /observations` | Returns recent local, forwarded, and uploaded sensor observations for the operator UI. |
| `GET /alerts` | Returns edge-generated and Foundry-enriched alerts for the operator UI. |
| `POST /alerts/{alert_id}/ack` | Records operator acknowledgement from the operator UI. |

Example bundle:

```json
{
  "bundle_id": "altiair-node-a-20260502T120000Z-0001",
  "node_id": "altiair-node-a",
  "captured_at": "2026-05-02T12:00:00Z",
  "sensor_type": "rfid",
  "media": [],
  "rfid": {
    "reader_id": "rfid-a",
    "tag_id": "training-subject-001",
    "zone": "checkpoint-alpha",
    "read_count": 3
  },
  "location_fix": {
    "source": "mock_provider_rfid",
    "isMock": true,
    "zone": "checkpoint-alpha",
    "precision_m": 25,
    "confidence": 0.71,
    "freshness_s": 4
  },
  "edge_assessment": {
    "summary": "Tagged training subject likely near checkpoint alpha.",
    "confidence": 0.71,
    "recommended_next_check": "Verify with nearest camera or second RFID read."
  },
  "upload": {
    "status": "pending",
    "preferred_gateway": "altiair-hub"
  }
}
```

## Local Models

Hard rule: no Chinese-origin model families. Excluded examples include Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, and InternLM.

Benchmark candidates:

- Pi 5 low-latency candidate: `google/gemma-3-1b-it` or Ollama `gemma3:1b` if available locally.
- Pi 5 quality candidate: `ibm-granite/granite-3.3-2b-instruct`.
- Pi 4B/Pi 5 fallback candidate: `meta-llama/Llama-3.2-1B-Instruct`.
- Pi 5 quality alternatives: `meta-llama/Llama-3.2-3B-Instruct`, `HuggingFaceTB/SmolLM3-3B`, `microsoft/Phi-4-mini-instruct`.
- Microphone/ASR candidates: Whisper tiny/base/small via `whisper.cpp`, or IBM Granite Speech after hardware benchmarking.
- Retrieval candidates: `google/embeddinggemma-300m`, `nomic-ai/nomic-embed-text-v1.5`, or IBM Granite embeddings.

Output constraints:

- Prefer schema-constrained JSON for extraction.
- Cite source bundle IDs, Foundry object IDs, or Drive context documents.
- Always include uncertainty and next verification checks.
- Never emit autonomous tactical action instructions.
- Never produce target prosecution, engagement, or harmful action recommendations.

## One-Day Build Plan

1. Prepare the Pis.
   - Verify Raspberry Pi OS on both Pi 4B nodes and the Pi 5.
   - Set hostnames: `altiair-node-a`, `altiair-node-b`, and `altiair-hub`.
   - Enable SSH, camera support, microphone access, and RFID interfaces.
   - Install Python, FastAPI runtime, SQLite tooling, camera utilities, and networking tools.

2. Bring up the local LAN.
   - Configure travel router with AP isolation off.
   - Connect both Pi 4B nodes, Pi 5, and the Pi-hosted operator display shell.
   - Add static peer config if discovery takes too long.
   - Verify `GET /health` and `GET /peers` across devices.

3. Capture sensor bundles.
   - Normalize camera, microphone, RFID, and mock provider location events.
   - Store bundle metadata in SQLite and blobs on disk.
   - Include timestamps, node id, sensor type, retention policy, and confidence.

4. Route through the hub or best uplink.
   - Use Pi 5 as default gateway for the MVP.
   - Score alternate gateways by reachability, recent upload success, latency, and queue depth.
   - Return upload acknowledgements to the originating node.

5. Wire Foundry/CASK.
   - Try OSDK first if package, OAuth, and object/action details are ready.
   - Use REST/mock uploader if OSDK setup blocks the demo.
   - Map events into objects such as `SensorObservation`, `Asset`, `TrackEstimate`, `DroneObservation`, `ControlSourceEstimate`, `CounterUasCue`, `Alert`, `LocationFix`, and `NodeHealth`.

6. Build the Pi-hosted operator view.
   - Show node health, observations, location estimates, and insight drafts.
   - Use an EagleEye-style cue overlay so the demo can later map into a headborne display.
   - Add WebSocket reconnect and offline/degraded state.
   - Add acknowledgement action for alerts and drafts.

7. Rehearse the demo.
   - Show local-only operation.
   - Show RFID/camera/microphone event capture.
   - Show a fused insight draft with evidence and uncertainty.
   - Show a counter-UAS cue queue that estimates a likely control-source zone without recommending engagement.
   - Show cloud/CASK sync or deterministic mock acknowledgement.
   - Show recovery after a node, display client, or cloud path disconnects.

## Hackathon Checkpoints

| Time | Outcome |
| --- | --- |
| Saturday, May 2, 2026, 12:30 PM | Lanes locked, router plan selected, Foundry/CASK status known. |
| Saturday, May 2, 2026, 4:00 PM | Each lane shows a 30-second working clip or CLI trace. |
| Saturday, May 2, 2026, 9:00 PM | MVP cut: Pi-hosted display + Pi hub end-to-end works and is submittable. |
| Sunday, May 3, 2026, 2:00 AM | Hard stop for risky new scope. |
| Sunday, May 3, 2026, 9:00 AM | Three rehearsals under the target pitch time. |
| Sunday, May 3, 2026, 11:45 AM | Submission ready. |

## Demo Beats

1. Pi 5 hub and Pi-hosted EagleEye-style display are visible on the local LAN.
2. Operator display is local-only, with no dependency on cloud access.
3. Pi 4B node captures RFID plus camera or microphone event.
4. Pi 5 hub receives the bundle, fuses deterministic evidence, and drafts a structured insight.
5. Pi-hosted display updates with an EagleEye-style cue overlay.
6. Counter-UAS cue queue shows a drone observation, likely control-source zone, evidence links, confidence, and policy gate.
7. If Foundry/CASK is online, the hub syncs and receives acknowledgement or enrichment.
8. If the cloud or one operator device drops, local devices continue showing cached mesh state and new local events.
9. When connectivity returns, queued events reconcile.

## Shared Context / Drive Intake

The shared Google Drive is the working drop for everyone's data ideas. For anything intended to become LLM context, include enough metadata for later ingestion:

- Title and owner.
- Source type: mock data, sensor note, Foundry idea, architecture note, evaluation prompt, UI idea, or policy constraint.
- Whether the content is real, synthetic, mocked, or speculative.
- Sensitivity and retention expectation.
- Related sensor/event types, if known.
- Short summary of how it should affect the CASK demo.

The RAG ingestion path should only consume cleared material and should preserve source attribution so generated insight drafts can cite the relevant Drive document, Foundry object, or sensor event.

## Hard Constraints

- No credentials, access details, tokens, client secrets, or private Foundry URLs in git.
- No Chinese-origin model families.
- LLM output is advisory. Mission-critical actions must stay behind deterministic checks, policy gates, and operator review.
- Raw camera/audio retention must follow policy. Prefer structured detections, transcripts, and redacted references over storing raw media.
- No kill-chain automation. Human review is required for every consequential output.
- No target prosecution, engagement planning, or instructions to harm a person.
- No drone swarm coordination, offensive cyber, RF jamming detection, or adversary spoofing in the MVP.
- No hidden dependency on internet access for the local demo path.

## Proposal Slots

Use pull requests to update these sections as people bring ideas:

- Proposed Foundry Ontology objects/actions:
- Proposed CASK deployment topology:
- Proposed Pi hardware split:
- Proposed mesh transport:
- Proposed model/runtime stack:
- Proposed retention and security policy:
- Proposed shared Drive context corpus:
- Proposed evaluation prompts and metrics:
- Proposed counter-UAS cueing policy gate:
- Proposed EagleEye / Lattice / NGC2 / Lockheed interoperability mapping:

Each proposal should include:

- What decision it changes.
- Why it is better for mission reliability.
- Hardware/runtime assumptions.
- Data/security impact.
- How we can test it on Pi 4B and Pi 5.

## Immediate Next Steps

1. Confirm CASK-specific docs or in-platform guidance available in Foundry.
2. Create or identify the `cask-edge-service` Developer Console application.
3. Export the first OSDK package for the minimum object/action set, or define the REST/mock fallback route.
4. Scaffold `pi/`, `web/`, `foundry/`, `sensors/`, and `demo/` folders.
5. Build a synthetic sensor-event fixture for camera, microphone, RFID, and mock provider location telemetry.
6. Add a synthetic counter-UAS fixture with `DroneObservation`, `ControlSourceEstimate`, `CounterUasCue`, and `PolicyGate` records.
7. Add an EagleEye-style display fixture that renders cue overlays from the same `CounterUasCue` schema.
8. Seed the shared Drive with team data ideas and context candidates using the intake convention above.
9. Benchmark the first local model pair on the two Pi 4 Model B nodes and one Pi 5.
10. Define the first structured `InsightDraft` and `CounterUasCue` JSON schemas with acceptance tests.

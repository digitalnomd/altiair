# DarkMesh — Resilient Edge Intelligence for Contested Operations

Resilient edge intelligence for contested, degraded, and disconnected environments. 
Built at the 3rd Annual NatSec Hackathon (Cerebral Valley × Army xTech) for Edge Deployments, Field & Drone Operations.

---

## Problem

Tactical edge units in DDIL environments operate multiple sensors: cameras, microphones, RF receivers, RFID readers, that generate independent, uncoordinated signals. No existing lightweight system fuses those signals locally without a cloud backend or a central command node. Cloud-connected C2 dies the moment the network is jammed. Centralized command architectures fail when the coordinator node is taken out. The result is that squad leaders manually stitch together fragmented sensor data under fire, with degraded comms, and no reliable shared picture.

The specific gap: three separate soldiers can observe the same drone from three different angles — visual, acoustic, RF — and produce zero correlated output because nothing is connecting those streams at the edge in real time.

---

## What DarkMesh Does

DarkMesh is a decentralized multi-node sensor fusion system that runs entirely on local hardware. Each node in the mesh collects sensor data, filters it locally with a small LLM, and replicates compact signed evidence bundles to every other reachable node. A coordinator LLM is elected across the mesh using a Raft-style protocol, fuses the gossip world state into a single threat assessment, and publishes per-node instructions toward the active mission objective.

When a node fails, the mesh detects the missed heartbeat, re-elects a coordinator from the surviving quorum, and resumes — typically in under a second. Mission state is replicated to every node simultaneously, so no single device is authoritative and no single failure collapses the picture.

When connectivity is available, the full record — every sensor event, fusion decision, and coordinator term — syncs to Palantir Foundry through the OSDK. Offline, the mesh runs from a local CASK edge layer with the same ontology contracts, queuing everything for reconciliation when a gateway reconnects.

---

## Architecture

```
TIER 3 — PALANTIR FOUNDRY / CASK
         Ontology sync · AIP enrichment · Workshop dashboard · After-action record
              ▲  store-and-forward; queues locally when offline
TIER 2 — RASPBERRY PI 5 HUB  [altiair-hub · 10.77.0.10]
         Rust node API · SQLite durable queue · Local LLM (Gemma / Granite)
         WireGuard gateway · WebSocket fanout · Pi-hosted operator display
              ▲  WireGuard encrypted overlay · Altiair-LAN private AP
TIER 1 — EDGE NODES
  [altiair-node-a · 10.77.0.11]   Raspberry Pi 4B — RFID · camera · sensor
  [altiair-node-b · 10.77.0.12]   Raspberry Pi 4B — RF · mic · operator notes
  [altiair-orin  · 10.77.0.20]   Jetson Orin Nano — accelerated inference · secondary gateway
```

No external router, phone hotspot, or internet path is required for local operation. The Pi 5 hosts the private mission LAN (`Altiair-LAN`). Each node keeps a full local durable queue so hub or uplink loss does not halt capture or coordination.

---

## The Decentralized Mesh

The mesh is the core of the system. Every architectural decision follows from one requirement: no single point of failure.

**Gossip + Raft coordinator election.** Nodes continuously exchange heartbeats, evidence IDs, queue depths, and load hints into a shared world state. When the mesh needs a coordinator, it runs a scored Raft-style election — evaluating connectivity, latency, CPU load, local LLM availability, and evidence ownership. The elected coordinator publishes one `CaskCoordinatorDirective` per term containing the fused threat assessment and per-node instruction text. If the coordinator node fails, a new election completes in under one second.

**Replicated mission ledger.** Every reachable node stores the complete mission ledger: sensor events, location fixes, peer intents, node health, policy state, and upload receipts. Raw media follows policy and stays local; metadata, content hashes, thumbnails, and transcripts replicate everywhere. The invariant: if a record reaches the mesh, every reachable node stores it. The limitation: data that never left a powered-down node before failure cannot be recovered.

**Graceful degradation.** Full four-node operation produces the highest-confidence fusion. One-node failure leaves the mesh degraded but operational. Two-node failure drops below quorum but continues local sensing and evidence collection. The demo exercises this live on hardware — not in simulation.

**WireGuard encrypted overlay.** All inter-node communication runs over a narrow `10.77.0.0/24` WireGuard overlay (`wg0`). The physical underlay — Pi LAN, venue Wi-Fi, Jetson Ethernet fallback — is treated as untrusted. Mission identity is bound to the stable overlay node ID, not a network SSID or physical interface.

```bash
npm run mesh:smoke        # gateway failover and degradation
npm run mesh:plan -- --format summary
npm run replication:smoke # all-node ledger replication
```

---

## LLM Fusion and Coordinator

Every compute node runs a local LLM: both Pi 4Bs, the Pi 5 hub, and the Jetson Orin Nano. No Chinese-origin model families are used (Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, InternLM, or derivatives).

**Local filtering.** Before forwarding, each node's LLM classifies incoming sensor bundles: `send_now`, `summarize_first`, `hold`, `drop_duplicate`, or `review_policy`. This keeps the mesh from pushing raw continuous feeds across limited links. Deterministic Rust rules stay authoritative as a fallback when the model is unavailable or returns invalid output.

**Coordinator directive.** The Raft-elected coordinator receives the full gossip world state and cached Foundry/CASK mission context, then produces a single `CaskCoordinatorDirective` per term — a fused threat assessment with confidence, bearing, and evidence sources, plus per-node instruction text for every surviving online node. All recommended actions are non-kinetic: reposition, cover, verify, deconflict. No engagement planning is produced.

**Always-on stream spine.** Every accepted CASK bundle emits Kafka-shaped records on local named topics without requiring a running broker. The envelope is broker-ready (`topic`, `key`, `value`, `headers`) for forwarding when a connector is available.

| Node | Model | Role |
|---|---|---|
| Pi 4B | `SmolLM2-360M-Instruct` Q4 GGUF | Fast triage, dedup, JSON forwarding decisions |
| Pi 4B / Pi 5 | `Llama-3.2-1B-Instruct` GGUF | Classification, summarization |
| Pi 5 hub | `granite-3.3-2b-instruct` or `gemma4:e2b` | Insight drafts, coordinator directives |
| Jetson Orin | Accelerated vision + Whisper ASR | Drone detection, acoustic labels |

```bash
npm run fusion:smoke
npm run stream:smoke
```

---

## Palantir Foundry and CASK

Foundry is opportunistic, not a dependency. The mesh operates fully offline; Foundry provides governed mission context on the way in and commander-level visibility on the way out.

**CASK at the edge.** The Pi 5 hub runs a local CASK layer using the same ontology contracts and data model as Foundry — no internet required. Mission instructions, sensor observations, location fixes, coordinator directives, insight drafts, node health, and policy-gated `CounterUasCue` records are typed against the CASK schema and persisted in the local durable queue.

**Opportunistic sync.** When any gateway node regains connectivity, the full record queue reconciles to Foundry through the Palantir OSDK: every sensor event, fusion decision, coordinator term, and operator acknowledgement. Queued records carry explicit `pending-sync` state so the commander view accurately reflects what has and has not been confirmed upstream.

**Foundry intelligence pull.** When connected, the selected gateway pulls governed mission context — asset mappings, tag references, policy permissions — into the local LLM context cache. In DDIL, the coordinator and LLM run from the cached context with no live Foundry dependency.

OSDK writeback targets: `CaskMissionInstruction` · `CaskPolicyDecision` · `CaskDeploymentOrder` · `CaskNodeLease` · `CaskSensorObservation` · `CaskLocationFix` · `CaskCoordinatorDirective` · `CaskInsightDraft` · `CaskCounterUasCue` · `CaskNodeHealth`

```bash
npm run foundry:intel:smoke   # governed context pull
npm run smoke:foundry         # OSDK writeback
npm run mock:replay           # full CASK path from mock events
```

---

## Operator Display

The Pi-hosted display runs locally on the Pi 5 with no cloud dependency. It shows:

- Node status map — all nodes, live health (nominal / degraded / dark), coordinator identity, active term
- Sensor feed cards — camera detections with confidence, acoustic events, RF band readings per node
- Fusion assessment — correlated threat picture with confidence, bearing, supporting evidence, and contradictions
- `CounterUasCue` queue — drone class, estimated bearing, evidence drawer, policy gate state
- Coordinator directive panel — current per-node instruction text from the active term
- Operator acknowledgement — every consequential output requires explicit human review before it clears the policy gate

```bash
npm run node:api -- --node altiair-hub --port 8080
# http://10.77.0.10:8080/dashboard
```

---

## Hardware

| Qty | Device | Role |
|---|---|---|
| 2 | Raspberry Pi 4 Model B | Edge sensor nodes — camera, RFID, mic, local LLM filter |
| 1 | Raspberry Pi 5 | Hub — queue owner, display host, preferred Foundry gateway |
| 1 | Jetson Orin Nano | Accelerated inference — vision, ASR, secondary gateway |
| 1+ | Arduino RFID kit | Tag presence and provider-style location events |
| 1+ | USB camera / microphone | Visual and acoustic observations |

---

## Running Locally

No Foundry credentials required for the smoke path:

```bash
npm install
npm run build
npm run smoke:mock          # end-to-end with mock sensors and LLM
npm run mesh:smoke          # gateway failover
npm run replication:smoke   # ledger replication
npm run stream:smoke        # always-on stream spine
npm run security:smoke      # banned model family + secret literal scan
npm run mission:smoke       # mission instruction and policy gate
```

With Foundry credentials in `.env`:

```bash
npm run foundry:intel:smoke
npm run foundry:direct:smoke
npm run node:api:foundry -- --node altiair-hub
```

See [`docs/ddil-edge-mesh-implementation.md`](docs/ddil-edge-mesh-implementation.md) for the full deployment checklist, WireGuard key generation, and Pi 5 AP setup.

---

## Security

- WireGuard encrypted overlay on all inter-node paths; physical underlay treated as untrusted
- AES-256-GCM encrypted payload storage in the Rust durable agent
- Ed25519 per-record signatures before peer replication
- Bearer token (`ALTIAIR_API_TOKEN`) required on all protected API routes
- Default-deny firewall; node API bound to the WireGuard interface only
- Raw media stays local by default — structured detections, transcripts, and content hashes replicate across the mesh
- LLM output is advisory; deterministic policy code is authoritative for all forwarding and blocking decisions
- No credentials, secrets, or private Foundry URLs committed to git

---

## Scope

This system covers detection, sensor fusion, evidence attribution, and policy-gated human review. It does not produce engagement plans, target prosecution instructions, or autonomous action recommendations. All `CounterUasCue` records require explicit operator acknowledgement. Training scenarios use non-contact, operator-authorized, consenting participants or tagged assets only.

---

## DARPA Alignment

| Program | Connection |
|---|---|
| DARPA MINC | Always-on overlay, mission-aware information flows, self-healing adaptation on node or uplink failure |
| DARPA SHARE | Secure resilient tactical-edge sharing — the store-and-forward path implemented here |
| DARPA EdgeCT | Mission-aware edge analytics driving network adaptation when WAN paths degrade or fail |
| CJADC2 | Local sensor fusion, local storage, delayed forwarding, data standardization, and security at the edge |

---

## Docs

- [DDIL Edge Mesh Implementation](docs/ddil-edge-mesh-implementation.md)
- [CASK Edge Implementation](docs/cask-implementation.md)
- [CASK Ontology Approach](docs/cask-ontology-approach.md)
- [Replicated Mission Ledger](docs/replicated-mission-ledger.md)
- [Distributed Resolution Demo](docs/distributed-resolution-demo.md)
- [Security Implementation Plan](docs/security-implementation-plan.md)
- [DARPA Opportunity Alignment](docs/darpa-opportunity-alignment.md)
- [Foundry Atlas Status](docs/foundry-atlas-status.md)

# DarkMesh — Resilient Edge Intelligence for Contested Operations

---

## The Problem

Imagine four soldiers in the field. One spots a drone. Another hears a rotor. A third catches an RF ping. Alone, each signal is noise. Together, they're a threat picture — but only if you can fuse them in real time, under fire, with degraded comms. The current answer is either a cloud-connected C2 system that dies the moment the network is jammed, or a centralized command node where taking out one person collapses the entire mission. Neither survives a contested DDIL environment. The squad leader ends up mentally stitching together scattered signals while making a shoot/no-shoot decision, with no reliable tool to help.

---

## The Solution: DarkMesh

## TAGLINE

DarkMesh turns a squad's scattered field sensors into a single fused intelligence picture — locally, without cloud, without a central command node — and keeps the mission running even when nodes go dark.

Each soldier is a node: a Raspberry Pi running camera, microphone, and RF sensors, with a Jetson Orin Nano running local AI inference. Raw signals are filtered at the edge and shared as compact signed evidence across an encrypted local Wi-Fi mesh. A coordinator LLM is elected across the mesh to fuse all signals, assess the threat picture, and issue per-node instructions — all from the stated mission objective. When one node fails, another detects the missed heartbeat and assumes coordination in under a second. State lives on every node simultaneously, not in any one command device.

**Four weak signals. Alone — noise. Together — one explainable threat picture.**

---

## Architecture

```
TIER 3 — PALANTIR FOUNDRY / CASK
         Ontology sync · AIP enrichment · Workshop dashboard · After-action record
              ▲  (store-and-forward — queues locally when offline)
TIER 2 — RASPBERRY PI 5 HUB  [altiair-hub · 10.77.0.10]
         Rust node API · SQLite durable queue · Local LLM (Gemma/Granite)
         WireGuard gateway · WebSocket fanout · Pi-hosted EagleEye-style display
              ▲ ▲  (WireGuard encrypted overlay · Altiair-LAN private AP)
TIER 1 — EDGE NODES
  [altiair-node-a · 10.77.0.11]   Raspberry Pi 4B — RFID / camera / sensor
  [altiair-node-b · 10.77.0.12]   Raspberry Pi 4B — RF / mic / operator notes
  [altiair-orin  · 10.77.0.20]   Jetson Orin Nano — accelerated inference · secondary gateway
```

No external router. No phone hotspot. No internet required. The Pi 5 hosts the private mission LAN (`Altiair-LAN`). Every node joins the WireGuard overlay and keeps a full local queue so hub or uplink loss never halts capture.

---

## The Decentralized Mesh

The mesh is the centerpiece. Every design decision flows from one constraint: no single point of failure.

**Gossip + Raft coordinator election.** Nodes continuously exchange heartbeats, evidence IDs, queue depths, and load hints into a shared world state. When the mesh needs a coordinator LLM, it runs a Raft-style election — scoring candidates by connectivity, latency, queue depth, CPU load, local LLM availability, and evidence ownership. The winning node publishes structured per-node instructions for the active term.

**Replicated mission ledger.** Every reachable node stores the complete mission ledger: sensor events, location fixes, peer intents, node health, policy state, and upload receipts. If one node goes dark, the surviving quorum already holds its evidence. The claim is: if a record reaches the mesh, every reachable node stores it.

**Graceful degradation.** Four-node full operation gives the highest confidence. One-node failure leaves the mesh degraded but operational. Two-node failure drops below quorum but keeps collecting evidence. Node loss triggers coordinator re-election in under one second — the demo shows this live, on hardware, by physically unplugging a node.

**WireGuard encrypted overlay.** Every node communicates over a narrow `10.77.0.0/24` WireGuard overlay. The underlay (Pi LAN, venue Wi-Fi, Jetson Ethernet fallback) is treated as untrusted. Mission identity is the stable overlay node ID, not a network SSID.

```bash
npm run mesh:smoke        # gateway failover + degradation smoke
npm run mesh:plan -- --format summary
npm run replication:smoke # all-node ledger replication check
```

---

## LLM Fusion + Coordinator

Every compute node — both Pi 4Bs, the Pi 5 hub, and the Jetson Orin Nano — runs a local LLM. No Chinese-origin model families (Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, InternLM, or derivatives).

**Local filtering layer.** Each node's LLM classifies incoming sensor bundles before forwarding: `send_now`, `summarize_first`, `hold`, `drop_duplicate`, or `review_policy`. Raw media stays local; compact signed evidence crosses the mesh. Deterministic Rust rules remain authoritative when the model is unavailable.

**Coordinator LLM.** The Raft-elected coordinator receives the gossip world state and the current Foundry/CASK mission context, then publishes one `CaskCoordinatorDirective` per term:
- The fused threat assessment with confidence, bearing, and evidence sources
- Per-node instruction text for every surviving online node
- Policy-gated recommended next action (non-kinetic: reposition, cover, verify, deconflict)

**Always-on stream spine.** Every accepted CASK bundle emits Kafka-shaped records on local topics (`altiair.cask.sensor.v1`, `.location.v1`, `.cue.v1`, `.coordinator.v1`, `.foundry-sync.v1`, and more) without requiring a running broker. The stream is broker-ready when a connector is available.

| Node | Candidate model | Role |
|---|---|---|
| Pi 4B | `SmolLM2-360M-Instruct` Q4 GGUF | Fast triage, dedup, JSON forwarding decisions |
| Pi 4B / Pi 5 | `Llama-3.2-1B-Instruct` GGUF | Classification, summarization |
| Pi 5 hub | `granite-3.3-2b-instruct` or `gemma4:e2b` | Insight drafts, coordinator directives |
| Jetson Orin | Accelerated vision inference | Drone detection, Hawkeye-style feed, ASR |

```bash
npm run fusion:smoke
npm run coordinator:smoke
npm run stream:smoke
```

---

## Palantir Foundry / CASK

Foundry is opportunistic, not required. The mesh operates fully offline; Foundry provides governed context on the way in and commander visibility on the way out.

**CASK at the edge.** The Pi 5 hub runs a local CASK layer with the same ontology contracts and data model as Foundry — no internet required. Mission instructions, sensor observations, location fixes, coordinator directives, insight drafts, node health, and policy-gated `CounterUasCue` records are all typed against the CASK schema and stored in the local durable queue.

**Opportunistic sync.** When any node regains connectivity, the full record reconciles to Foundry automatically via the Palantir OSDK: every sensor event, every fusion decision, every coordinator term, every operator acknowledgement. Queued records carry explicit `pending-sync` state so the commander view is never falsely marked as uploaded.

**Foundry intelligence pull.** When connected, the selected gateway pulls governed mission context — asset mappings, tag-to-object references, policy permissions — into the local LLM context cache. In DDIL, the LLM and coordinator run from the cached context without a live Foundry dependency.

```bash
npm run foundry:intel:smoke   # governed context pull
npm run smoke:foundry         # OSDK writeback smoke
npm run mock:replay           # full CASK demo path from mock events
```

OSDK writeback targets: `CaskMissionInstruction` · `CaskPolicyDecision` · `CaskDeploymentOrder` · `CaskNodeLease` · `CaskSensorObservation` · `CaskLocationFix` · `CaskCoordinatorDirective` · `CaskInsightDraft` · `CaskCounterUasCue` · `CaskNodeHealth`

---

## Dashboard

The Pi-hosted EagleEye-style display runs locally on the Pi 5 with no cloud dependency. It renders:

- **Tactical mesh map** — all nodes, live status (green / degraded / dark), WireGuard overlay health
- **Sensor feed cards** — camera detections with confidence, acoustic events, RF band readings
- **Fusion bar** — real-time confidence assembly as evidence arrives from multiple nodes
- **Coordinator directive panel** — current elected coordinator, active term, per-node instruction text
- **CounterUasCue queue** — drone class, estimated bearing, confidence ring, evidence drawer, contradictions, policy gate state
- **Operator acknowledgement flow** — every consequential output requires human review before it leaves the policy gate

When a node goes dark, the dashboard shows `[DARK]`, flashes coordinator re-election, and resumes per-node instructions under the new coordinator — all within one second.

```bash
npm run node:api -- --node altiair-hub --port 8080
# then open http://10.77.0.10:8080/dashboard
```

---

## Hardware

| Qty | Device | Role |
|---|---|---|
| 2 | Raspberry Pi 4 Model B | Edge sensor nodes — camera, RFID, mic, local LLM filter |
| 1 | Raspberry Pi 5 | Hub — queue owner, display host, preferred Foundry gateway |
| 1 | Jetson Orin Nano | Accelerated inference — vision, ASR, secondary gateway |
| 1+ | Arduino RFID kit | Provider-style location and tag presence events |
| 1+ | Camera / microphone inputs | Visual and acoustic observations |

---

## Running Locally

No Foundry credentials required for the smoke path:

```bash
npm install
npm run build
npm run smoke:mock          # end-to-end mock path
npm run mesh:smoke          # gateway failover
npm run replication:smoke   # ledger replication
npm run stream:smoke        # always-on stream spine
npm run security:smoke      # banned model + secret scan gates
npm run mission:smoke       # mission instruction deployment
```

With Foundry credentials in `.env`:

```bash
npm run foundry:intel:smoke
npm run foundry:direct:smoke
npm run node:api:foundry -- --node altiair-hub
```

See [`docs/ddil-edge-mesh-implementation.md`](docs/ddil-edge-mesh-implementation.md) for the full deployment checklist, WireGuard setup, and Pi AP configuration.

---

## Security Posture

- WireGuard encrypted overlay — every node-to-node path; underlay treated as untrusted
- AES-256-GCM encrypted payload storage in the Rust durable agent
- Ed25519 per-record signatures before peer replication
- `ALTIAIR_API_TOKEN` bearer token on all protected API routes
- Default-deny firewall; node API bound to the WireGuard overlay interface only
- Raw media stays local by default — structured detections, transcripts, and hashes cross the mesh
- LLM output is advisory only — deterministic policy code owns all forwarding and blocking decisions
- No credentials, secrets, or private Foundry URLs in git

---

## DARPA Alignment

| Program | Alignment |
|---|---|
| DARPA MINC | Always-on overlay, mission-aware information flows, self-healing adaptation on node or uplink failure |
| DARPA SHARE | Secure, resilient tactical-edge sharing over available networks — the store-and-forward path |
| DARPA EdgeCT | Mission-aware edge analytics driving network adaptation when WAN paths fail |
| CJADC2 | Local sensor fusion, local storage, delayed forwarding, standardization, security, and scalability at the edge |

---

## Scope Constraints

- Detection, attribution cueing, and policy-gated human review only — no engagement planning, target prosecution, or autonomous action
- Training tag objectives are non-contact, operator-authorized, and limited to consenting participants or tagged assets
- No Chinese-origin model families
- No CUI or classified data in the demo environment
- No drone swarm coordination, offensive cyber, or RF jamming in the MVP

---

*DarkMesh is not a research concept. It is a working system, running on cost-efficient hardware, solving the exact problem DARPA and Army XTech have flagged as open in the field.*

Built at the 3rd Annual NatSec Hackathon (Cerebral Valley × Army xTech, Shack15 SF) for Edge Deployments, Field & Drone Operations

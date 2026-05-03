# DDIL Edge Mesh Implementation

This is the implementation track for the four-node Altiair DDIL mesh:

- `altiair-node-a`: Raspberry Pi 4 Model B edge sensor node.
- `altiair-node-b`: Raspberry Pi 4 Model B edge sensor node.
- `altiair-hub`: Raspberry Pi 5 hub, display host, queue owner, and preferred CASK/Foundry gateway.
- `altiair-orin`: Jetson Orin Nano accelerated inference node and secondary CASK/Foundry gateway.

The implementation is deliberately policy-gated. It supports resilient sensing, evidence fusion, local review, and store-and-forward synchronization. It does not implement target prosecution, engagement planning, capture instructions, or autonomous action.

DARPA alignment is tracked separately in [DARPA Opportunity Alignment](darpa-opportunity-alignment.md).

## Source Baseline

Current implementation choices are grounded in these public primary or vendor-primary references:

- DARPA MINC: mission-integrated network control for contested, dynamic communications through always-on overlays, cross-network optimization, and mission-driven information flows. Source: https://www.darpa.mil/news/2022/minic-data-flow-contested-environment
- DARPA SHARE: secure, resilient tactical-edge information sharing over available military or commercial networks, transitioned into TAK. Source: https://www.darpa.mil/news/2023/communications-tactical-edge
- DARPA EdgeCT: mission-aware mitigation of WAN failures and attacks using edge analytics, holistic decision systems, and configurable protocol stacks. Source: https://www.darpa.mil/research/programs/edge-directed-cyber-technologies-for-reliable-mission-communication
- CJADC2 edge-fusion industry framing: edge systems can operate independently in communications-denied environments; implementation challenges include edge data collection/forwarding, standardization, security, and scalability. Source: https://militaryembedded.com/ai/machine-learning/cjadc2-interoperability-ai-ml-based-sensor-fusion-at-the-edge
- NIST SP 800-218 secure software development framework: secure development practices for preparing, protecting, producing, and responding across the software lifecycle. Source: https://csrc.nist.gov/pubs/sp/800/218/final
- NIST SP 800-207 zero trust: no implicit trust by network location; authenticate and authorize device/service access before resource use. Source: https://csrc.nist.gov/pubs/sp/800/207/final
- CISA Secure by Design: ship secure defaults, reduce attack surface, and make the product owner responsible for security outcomes. Source: https://www.cisa.gov/securebydesign
- OWASP ASVS: verification baseline for API authentication, access control, input validation, cryptography, and error handling. Source: https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-171 Rev. 3 / DoD CMMC: use these as the DoD-adjacent protection target if CUI enters scope. Sources: https://csrc.nist.gov/pubs/sp/800/171/r3/final and https://dodcio.defense.gov/CMMC/Model/
- NATO Federated Mission Networking framing: mission networks are federated, governed, interoperable, and non-hierarchical. Source: https://coi.nato.int/FMNPublic/SitePages/Home_RML.aspx
- IBM Research DDIL edge MLOps: edge AI must explicitly handle denied, degraded, intermittent, and low-bandwidth conditions across model lifecycle, DDIL challenges, and application stack. Source: https://research.ibm.com/publications/mlops-at-the-edge-in-ddil-environments
- WireGuard quick start: Linux overlay interface, explicit peer keys, narrow allowed IPs, and optional persistent keepalive for NAT/firewall cases. Source: https://www.wireguard.com/quickstart/
- Raspberry Pi OS networking: Bookworm and newer use NetworkManager/`nmcli` for wireless configuration. Source: https://www.raspberrypi.com/documentation/computers/configuration.html
- Raspberry Pi wireless access point setup: Raspberry Pi documents creating a hotspot with `nmcli`. Source: https://www.raspberrypi.com/documentation/configuration/wireless/wireless-access-point.md
- NVIDIA Jetson Linux Orin docs: Orin Nano is the right node for accelerated camera/media/inference work and security-conscious platform setup. Source: https://docs.nvidia.com/jetson/archives/r36.5/DeveloperGuide/SO/JetsonOrinSeries.html
- NATS edge architecture and JetStream: local leaf nodes plus JetStream mirroring are a future upgrade path for store-and-forward recovery after connectivity outages. Sources: https://docs.nats.io/nats-concepts/service_infrastructure/adaptive_edge_deployment and https://docs.nats.io/nats-concepts/jetstream
- libp2p GossipSub: peer-to-peer pub/sub controls traffic with sparse full-message peerings and gossip metadata; useful as a future discovery/pubsub option, not day-one complexity. Source: https://libp2p.io/docs/pubsub/
- MITRE Cursor on Target: optional adapter boundary for "what, when, where" position/event interoperability where an authorized TAK/CoT environment exists. Source: https://www.mitre.org/news-insights/publication/after-action-report-cursor-target-fy14-international-user-group-meeting

## Day-One Architecture

Assume no dedicated router, no phone hotspot, and no internet path. The Pi 5 is the local mission LAN: it broadcasts the private Wi-Fi AP `Altiair-LAN`, the two Pi 4Bs join it, and the Jetson joins by Wi-Fi if possible or Ethernet if needed. The stable mission model is node identity, local queueing, gateway selection, and policy-gated sync over this local link.

For the physical node-loss preservation demo, loopback is only a local development fallback. Separate devices must share at least one local peer link before the controlled node-loss test so a bundle can replicate off the node that later goes down. The mesh preserves evidence that has already reached another node; it cannot recover a bundle that existed only on a device that was powered off, isolated, or destroyed before replication.

| Node | Day-one link assumption | Overlay | Role |
| --- | --- | --- | --- |
| `altiair-hub` | Pi 5 creates `Altiair-LAN` private AP | `10.77.0.10` | Pi 5 hub, queue owner, display host, preferred CASK/Foundry gateway |
| `altiair-node-a` | Pi 4B joins `Altiair-LAN` | `10.77.0.11` | Pi 4B sensor node |
| `altiair-node-b` | Pi 4B joins `Altiair-LAN` | `10.77.0.12` | Pi 4B sensor node |
| `altiair-orin` | Jetson joins `Altiair-LAN`; Ethernet fallback if Wi-Fi fails | `10.77.0.20` | Jetson inference node, secondary CASK/Foundry gateway |

Network rules:

- Do not require an external hotspot, router, or internet path for the proof.
- Start with logical nodes on one host only as a software fallback.
- For physical distribution, bring up the Pi 5 `Altiair-LAN` AP before the controlled node-loss test.
- Use Jetson Ethernet as the fallback if Jetson Wi-Fi does not cooperate.
- Use venue Wi-Fi only as an optional later uplink; do not depend on it for node-to-node traffic.
- Use `wg0` overlay `10.77.0.0/24`; keep each peer `AllowedIPs` to one `/32` so routing stays narrow.
- WireGuard templates use `<hostname>.local` endpoints on the Pi 5 LAN when mDNS works. If mDNS fails, replace the endpoint with the current peer IP from `ip addr`, `nmcli device show`, or `arp -a`.
- Keep raw media local by default. Forward metadata, thumbnails, transcripts, or short clips first.
- Every node keeps a local queue so hub or uplink loss does not halt capture.
- Every reachable node stores the mission ledger from every node: observations, location fixes, peer intents, selected-role/tag-plan state, node health, policy state, hashes/references, and sync receipts.
- A node-loss demo must show replication before failure: create a bundle, verify it exists on a surviving peer, then power down or isolate one node and confirm mission continuity remains degraded but operational.
- CASK/Foundry upload is gateway-selected and policy-gated; local review continues when no gateway is eligible.
- One-node failure is expected. The mesh is degraded but operational if at least one sensor node and either `altiair-hub` or `altiair-orin` remain online.

## Repo Implementation

The mesh code lives in:

- `src/mesh/defaultTopology.ts`: typed four-node topology, static IP plan, roles, constraints, and nominal health observations.
- `src/mesh/gatewaySelection.ts`: gateway scoring, hysteresis, stale heartbeat rejection, congestion/backpressure decisions, and one-node-failure continuity reporting.
- `src/mesh/types.ts`: topology, peer health, gateway, and congestion contracts.
- `src/scripts/mesh-plan.ts`: prints the topology or per-node environment/WireGuard templates without secrets.
- `src/scripts/mesh-smoke.ts`: deterministic smoke check for normal and degraded gateway selection.
- `src/scripts/node-api.ts`: dependency-free prototype API for the edge-node contract before the Rust service lands, including bundle ingest, replication status, and local ledger views.

Commands:

```bash
npm run mesh:plan -- --format summary
npm run mesh:plan -- --node altiair-hub --format env
npm run mesh:plan -- --node altiair-hub --format wireguard
npm run mesh:smoke
npm run node:api -- --node altiair-hub --port 8080
```

Pi 5 AP setup:

```bash
sudo nmcli device wifi hotspot ifname wlan0 con-name altiair-lan ssid Altiair-LAN password "change-this-demo-password"
```

If the Pi 5 uses its Wi-Fi radio as the AP, do not depend on that same radio for internet. The local mesh still works; Foundry/CASK sync queues until any gateway gets internet later.

Field deployment pattern:

- The Pi 5 `Altiair-LAN` is the hackathon's first local network cell, not the final topology limit.
- Drones, Hawkeye/vehicle kits, operator compute, or gateway payloads can host, join, or bridge additional local LAN cells when that underlay fits the deployment.
- Do not assume every drone must present its own LAN. A drone can present a LAN, join the nearest mission LAN, bridge Ethernet/radio into the overlay, or operate as a store-forward node until it sees another peer.
- Application identity is the stable `10.77.0.x` overlay node identity, not the SSID or physical radio link.
- Replication remains the invariant: every reachable cell forwards compact evidence bundles, peer intents, tag-plan state, node health, hashes, and sync receipts to every reachable peer.

Once a bundle is posted, the prototype API exposes the all-reachable-node replication contract:

```bash
curl -H "Authorization: Bearer $ALTIAIR_API_TOKEN" http://127.0.0.1:8080/replication
curl -H "Authorization: Bearer $ALTIAIR_API_TOKEN" http://127.0.0.1:8080/replication/latest
curl -H "Authorization: Bearer $ALTIAIR_API_TOKEN" http://127.0.0.1:8080/ledger
```

The WireGuard output is a template. Generate keys on each device:

```bash
umask 077
wg genkey | tee privatekey | wg pubkey > publickey
```

Do not commit generated keys, Foundry URLs, registry tokens, OAuth secrets, or private ontology RIDs.

## Security Baseline

The implementation security plan is tracked in [Security Implementation Plan](security-implementation-plan.md). The short version:

- Treat every underlay as untrusted, including loopback-to-LAN transitions, the Pi 5 `Altiair-LAN` AP, venue Wi-Fi, Jetson Ethernet fallback, and any optional backup hotspot/router. The trusted mission path is the WireGuard overlay plus per-node identity.
- Set `ALTIAIR_API_TOKEN` for every demo where the API is reachable beyond loopback. Protected API routes require `Authorization: Bearer <token>` when the token is configured.
- Bind the node API deliberately with `ALTIAIR_API_HOST`; prefer the node's WireGuard overlay address instead of `0.0.0.0` for live demos.
- Use a default-deny firewall and allow the node API only on `wg0`.
- Keep raw media local by default. Forward structured detections, thumbnails, transcripts, hashes, and policy state before full media.
- Keep Foundry/CASK secrets only on gateway-role nodes and only in environment variables or platform secret storage.
- Sign bundles in the production agent before forwarding. The signed envelope should include node ID, bundle ID, created time, policy state, and content hash.
- Make the LLM advisory only. Deterministic policy code owns `send_now`, `summarize_first`, `hold`, `drop_duplicate`, `review_policy`, and `blocked` behavior.

## Gateway Selection

Gateway scoring favors:

- Reachable CASK/Foundry path.
- Recent successful upload.
- Fresh heartbeat.
- Ethernet or stronger link class.
- Higher uplink bandwidth.
- Lower packet loss, latency, queue depth, in-flight transfers, CPU load, and memory pressure.
- Pi 5 hub as preferred gateway, Jetson Orin as secondary gateway.

If the current gateway is close enough to the best score, hysteresis keeps it to avoid flapping. If no gateway can reach Foundry/CASK, the decision becomes local-only and nodes keep store-forward queues active.

Mission continuity reporting classifies the mesh as `nominal`, `degraded_one_node_failed`, `degraded_multi_node`, `local_only`, or `offline`. This is the MINC-style mission-control hook: network state is translated into mission operation state, not just link health.

## Deployment Checklist

1. Flash Raspberry Pi OS Lite 64-bit on both Pi 4B nodes and the Pi 5; use Ubuntu/Jetson Linux on the Orin Nano.
2. Set hostnames: `altiair-node-a`, `altiair-node-b`, `altiair-hub`, `altiair-orin`.
3. Start with the no-router proof path: run logical nodes on one host if needed, then make the Pi 5 the local mission LAN.
4. Create `Altiair-LAN` on the Pi 5:

```bash
sudo nmcli device wifi hotspot ifname wlan0 con-name altiair-lan ssid Altiair-LAN password "change-this-demo-password"
```

5. Join both Pi 4Bs to `Altiair-LAN`; join the Jetson by Wi-Fi if available or Ethernet if needed.
6. Use venue Wi-Fi only as an optional uplink later; the local demo must not depend on venue peer traffic.
7. Before claiming physical preservation, verify one bundle replicated to a surviving peer and remains visible after a node is powered down or isolated.
8. Patch each device and enable SSH key auth only; disable password SSH before public demo use.
9. Install base tools on each node:

```bash
sudo apt update
sudo apt install -y curl jq sqlite3 wireguard-tools iperf3
```

10. Generate WireGuard keys on each device and exchange public keys out-of-band.
11. Generate each `wg0.conf` template with `npm run mesh:plan -- --node <node-id> --format wireguard`.
12. Replace placeholders with local private key and peer public keys on the device only.
13. Set an API token locally on each node, outside git:

```bash
export ALTIAIR_API_TOKEN="<demo-token>"
export ALTIAIR_API_HOST="<node-overlay-ip>"
```

14. Bring up the overlay:

```bash
sudo install -m 600 wg0.conf /etc/wireguard/wg0.conf
sudo systemctl enable --now wg-quick@wg0
wg show
```

15. Verify peer reachability:

```bash
ping -c 3 10.77.0.10
curl http://10.77.0.10:8080/health
curl -H "Authorization: Bearer $ALTIAIR_API_TOKEN" http://10.77.0.10:8080/mission-continuity
```

## Next Implementation Step

Wire the gateway and congestion decisions into the real node API:

- `GET /gateway` returns `GatewayDecision`.
- `GET /congestion` returns queue and link pressure plus `CongestionDecision`.
- `POST /bundles` runs `decideCongestion` before accepting or forwarding media.
- `POST /foundry/upload` is allowed only on the selected gateway and only when the bundle policy gate allows sharing.

The TypeScript prototype already exposes the first three endpoints and a local pending-bundle queue. The Rust service should preserve those response shapes.

CJADC2 mapping:

- Data collection: every node writes local bundles first, then forwards compact evidence when connectivity allows.
- Data standardization: CASK bundle contracts normalize camera, audio, RFID, provider-style location, node health, cues, and insights.
- Security: the day-one mesh uses WireGuard overlay identity, protected API routes, narrow peer routing, and policy-gated upload; production should add mTLS/workload identity, signed bundles, encrypted queues, and SBOM/release attestation.
- Scalability: gateway scoring and congestion decisions prevent one saturated node from blocking higher-priority evidence.

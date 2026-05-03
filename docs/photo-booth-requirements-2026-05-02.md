# Photo Booth Requirements Capture - 2026-05-02

Source: Sarah's Photo Booth pictures from the evening of May 2, 2026. Several handwritten labels are partially ambiguous, so this file captures the requirements we can act on without treating every word as a verbatim transcript.

## Extracted Requirements

| Theme | Captured note | Implementation interpretation |
| --- | --- | --- |
| Edge hardware | Raspberry Pi, Pi nodes, phone/chest computer, camera, microphone, RFID | Keep the Pi 4B/Pi 5/Jetson mesh as the primary compute path. Use the iPad as the chest-computer display for the demo; do not flash the Motorola unless we need a separate Android client later. |
| Live sensing | Always-on video/audio intelligence, RFID sensing, sensor mesh | Camera, microphone, RFID, and node-health events remain first-class CASK records. For the final demo, sensor data can be mocked while the network/mesh component stays live. RFID plus local Wi-Fi/proximity context mocks provider-style location by reader zone, RSSI, confidence, and freshness. |
| Edge inference | Local LLM, edge inference, Lattice-style local view | Run the local LLM on the Pi/Jetson nodes through each node's Ollama-compatible loopback endpoint. A Mac-hosted LLM is only a temporary repair bridge, not the target demo state. Exactly one elected coordinator publishes per-node directives for the current term. |
| Resilient network | Mesh network, path redundancy, nodes can go down, cloud can reconnect later | Preserve store-and-forward, replicated local ledgers, gateway failover, and Raft-style coordinator election. External connectivity is opportunistic. |
| Tactical underlay | L3Harris/tactical LTE, private 5G, provider-style location | Emit fake LTE/private-network location records in an L3Harris-style tactical provider envelope. This is a mock schema, not a vendor integration. The demo works on Altiair-LAN/Ethernet/WireGuard and records provider-style location shape without requiring a carrier network. |
| Foundry/CASK | Cask data collection, upload to cloud, structured data | Local CASK records must be uploadable through Foundry/OSDK when a gateway has connectivity, credentials, scopes, and policy authorization. Local LLM prompts should receive CASK ontology shape plus connected or cached Foundry intelligence context. |
| Onboarding | QR code, simple setup, phone setup | Add QR/Bluetooth onboarding as a planned setup flow for node URL, operator display URL, and temporary join instructions. Do not put secrets in QR payloads. |
| Security | Encryption, secure coding, memory-safe data | Make secure coding an acceptance gate: no committed secrets, protected API routes, security headers, model-family allow/block checks, policy-gated mission deployment, memory-safe Rust for the durable agent path, and planned signed/encrypted records. |
| Customer framing | MUSIC architecture, L3 idea, jam/radar eyes and ears, US Marine Corps | Use as narrative framing for resilient communications, geospatial data, and edge autonomy. Do not claim a current vendor or Marine Corps integration unless it exists. |

## Decisions

1. The demo remains local-first. Foundry/CASK enriches and records the mission when connected, but the local mesh keeps running in DDIL.
2. The phone is not the core node. It can view the Pi-hosted display, post operator acknowledgements, or help with onboarding. Use the iPad path first for the chest-computer demo.
3. Private LTE/5G is not required for the hackathon build. It is represented as a fake L3Harris-style tactical LTE provider envelope generated from RFID/Wi-Fi proximity evidence with the same CASK location-fix schema.
4. The local LLM is advisory. Deterministic CASK policy gates decide whether an instruction can deploy, be reviewed, or be blocked. Run the demo LLM on the Pi/Jetson node receiving the bundle; use a Mac-hosted endpoint only as a temporary repair bridge.
5. "Target" language in demo materials means an authorized training tag, tagged asset, or controlled training object. The system does not generate pursuit, capture, engagement, or harm instructions.
6. Secure coding is tracked in the repo through `npm run security:smoke` plus the security checklist in `docs/security-implementation-plan.md`.

## Frontend Notes

- First screen should show mission instruction input, policy state, active coordinator, node leases, sensor stream health, and Foundry sync state.
- Node detail should show camera, microphone, RFID/provider-style location, local LLM output, and last replicated CASK records.
- Failure demo should show one node going dark, a new coordinator term, preserved records, and queued Foundry sync.
- Setup view should support QR-assisted operator display join, node health checks, visible failure points, and redundancy status without exposing secrets.
- Chest-computer display can be the Pi-hosted UI mirrored or opened on Sarah's iPad. The Motorola is optional and should not be flashed unless the team explicitly needs a separate Android-only display.

## Open Items

- Decide whether QR onboarding lands in this repo or a thin frontend companion.
- Add signed record envelopes and encrypted queue storage before any real sensitive data is used.
- Map the optional private LTE/5G adapter to `CaskLocationFix` without changing the local Pi/RFID demo contract.

# Photo Booth Requirements Capture - 2026-05-02

Source: Sarah's Photo Booth pictures from the evening of May 2, 2026. Several handwritten labels are partially ambiguous, so this file captures the requirements we can act on without treating every word as a verbatim transcript.

## Extracted Requirements

| Theme | Captured note | Implementation interpretation |
| --- | --- | --- |
| Edge hardware | Raspberry Pi, Pi nodes, phone/chest computer, camera, microphone, RFID | Keep the Pi 4B/Pi 5/Jetson mesh as the primary compute path. Phones/tablets are viewer or optional input-shim clients, not required compute. |
| Live sensing | Always-on video/audio intelligence, RFID sensing, sensor mesh | Camera, microphone, RFID, and node-health events remain first-class CASK records. RFID can mock provider-style location by reader zone, RSSI, confidence, and freshness. |
| Edge inference | Local LLM, edge inference, Lattice-style local view | Every node can run local fusion or deterministic fallback; exactly one elected coordinator publishes per-node directives for the current term. |
| Resilient network | Mesh network, path redundancy, nodes can go down, cloud can reconnect later | Preserve store-and-forward, replicated local ledgers, gateway failover, and Raft-style coordinator election. External connectivity is opportunistic. |
| Tactical underlay | L3Harris/tactical LTE, private 5G, provider-style location | Treat tactical LTE/private 5G as an optional underlay adapter. The demo works on Altiair-LAN/Ethernet/WireGuard and records provider-style location shape without requiring a carrier network. |
| Foundry/CASK | Cask data collection, upload to cloud, structured data | Local CASK records must be uploadable through Foundry/OSDK only when a gateway has connectivity, credentials, scopes, and policy authorization. |
| Onboarding | QR code, simple setup, phone setup | Add QR/Bluetooth onboarding as a planned setup flow for node URL, operator display URL, and temporary join instructions. Do not put secrets in QR payloads. |
| Security | Encryption, secure coding, memory-safe data | Make secure coding an acceptance gate: no committed secrets, protected API routes, security headers, model-family allow/block checks, policy-gated mission deployment, and planned signed/encrypted records. |
| Customer framing | US Marine Corps / DDIL / DARPA / PACE or RACE notes | Use as narrative framing for resilient communications and edge autonomy. Do not claim a current integration unless it exists. |

## Decisions

1. The demo remains local-first. Foundry/CASK enriches and records the mission when connected, but the local mesh keeps running in DDIL.
2. The phone is not the core node. It can view the Pi-hosted display, post operator acknowledgements, or help with onboarding.
3. Private LTE/5G is not required for the hackathon build. It is represented as a future underlay adapter with the same CASK location-fix schema.
4. The local LLM is advisory. Deterministic CASK policy gates decide whether an instruction can deploy, be reviewed, or be blocked.
5. "Target" language in demo materials means an authorized training tag, tagged asset, or controlled training object. The system does not generate pursuit, capture, engagement, or harm instructions.
6. Secure coding is tracked in the repo through `npm run security:smoke` plus the security checklist in `docs/security-implementation-plan.md`.

## Frontend Notes

- First screen should show mission instruction input, policy state, active coordinator, node leases, sensor stream health, and Foundry sync state.
- Node detail should show camera, microphone, RFID/provider-style location, local LLM output, and last replicated CASK records.
- Failure demo should show one node going dark, a new coordinator term, preserved records, and queued Foundry sync.
- Setup view should support QR-assisted operator display join and node health checks without exposing secrets.

## Open Items

- Confirm exact phrasing of any L3Harris/private LTE requirement with the team.
- Decide whether QR onboarding lands in this repo or a thin frontend companion.
- Add signed record envelopes and encrypted queue storage before any real sensitive data is used.
- Map the optional private LTE/5G adapter to `CaskLocationFix` without changing the local Pi/RFID demo contract.

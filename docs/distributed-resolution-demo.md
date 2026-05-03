# Distributed Resolution Demo

This scenario is designed so no single Pi, Jetson, operator screen, or cloud path can resolve the event alone. The point of the demo is to prove that Altiair's edge mesh can fuse incomplete observations into a policy-gated training cue during DDIL operation, then exchange intent pings to deconflict support roles.

This aligns with the DARPA DDIL lineage:

- MINC: mission-integrated network control routes critical data to the right user at the right time across contested, dynamic communications.
- EdgeCT: edge devices infer network state and adapt protocol/application behavior without changing WAN infrastructure or encryption boundaries.
- DICE: decentralized AI agents coordinate peer-to-peer, remain resilient to failure or compromise of individual agents, and use local inference control to stay aligned with intent.

Sources:

- https://www.darpa.mil/news/2022/minic-data-flow-contested-environment
- https://www.darpa.mil/research/programs/edge-directed-cyber-technologies-for-reliable-mission-communication
- https://www.darpa.mil/research/programs/decentralized-artificial-intelligence-through-controlled-emergence
- https://www.darpa.mil/research/programs/secure-handhelds

There is no permanent central authority. Today `altiair-orin` is the Jetson local mission LAN host and preferred online/mock Hawkeye feed host; tomorrow `altiair-hub` is the Pi 5 camera/display/hub node when Ben adds it. Raft-style election makes the coordinator LLM singleton for only the current term. Replicated evidence and cached mission context allow any surviving three-node quorum to elect or retain a coordinator if one node fails. Foundry/CASK can enrich or reconcile later, but the live demo must still work with no venue Wi-Fi or internet.

The field version is multi-cell. A drone, Hawkeye kit, vehicle, or operator computer can host or join whatever local LAN is practical, then the overlay treats it as another reachable node or bridge. The current Jetson AP and tomorrow's Pi 5 AP are the smallest concrete versions of that pattern.

## Four Partial Views

| Node | What It Sees | Why It Cannot Resolve Alone |
| --- | --- | --- |
| `altiair-node-a` | Deployable peer health, replicated records, and local instructions. | It proves the mesh can task an extra edge node, but health alone does not identify or classify the cue. |
| `altiair-node-b` | RFID read for a tagged training subject or tagged asset in the zone. | RFID proves presence/identity, but not visual class, activity, or mission relevance. |
| `altiair-orin` | Jetson USB microphone context plus Hawkeye-style visual/track input. | Audio/visual context is useful, but cannot connect the cue to the RFID tag or policy gate alone. |
| `altiair-hub` | Reserved Pi 5 camera/display/hub node. | When added, it supplies camera/display capacity and mission context, but still is not authoritative by itself. |

Each node's local confidence stays below the resolution threshold. The fused view crosses threshold when at least three surviving nodes contribute replicated evidence. Full four-node operation gives the strongest confidence; one-node failure gives a degraded but still resolvable cue; two-node failure stays below quorum. After quorum resolution, each node publishes a signed intent ping with requested role and a short lease so the display, observation, safety, and tag-confirmation roles do not conflict.

The live system decides ownership pragmatically. The singleton coordinator LLM is the best connected or best positioned viable node for that Raft-style term, based on link quality, load, role, model availability, and current task/evidence ownership. Field support roles are assigned to the best-positioned nodes for the bounded training task, not to a permanent hub.

## Demo Flow

1. Start the current no-router proof path on the Jetson-hosted `Altiair-LAN`.
2. Join both Pi 4B nodes to `Altiair-LAN`.
3. Start the Jetson node API, Hawkeye-style online/mock feed, and local UI proxy.
4. Trigger or mock the RFID read on `altiair-node-b`.
5. Trigger or mock a Jetson USB microphone window.
6. Trigger the Hawkeye-style visual/track event from OpenSky/public online state or deterministic fallback; when Ben adds Pi 5, replace that path with the Pi 5 camera adapter.
7. The current Raft-elected singleton coordinator correlates the edge observations with replicated CASK/Foundry mission context.
8. The surviving quorum publishes peer intent pings and assigns supporting roles.
9. The display shows a policy-gated cue with evidence IDs, confidence, uncertainty, source nodes, peer intents, and required next checks.
10. Kill one node or the optional uplink. The mesh should elect or retain a surviving coordinator, show degraded mission continuity, and continue local operation.

## Acceptance Criteria

- A single node view never claims resolution.
- The display shows which evidence IDs were contributed by each surviving node.
- The fused cue crosses threshold only when a three-node quorum can correlate RFID, audio/micro-observation, visual inference, and replicated mission context.
- Peer pings prevent duplicate role claims after quorum resolution.
- The cue remains `review_needed` unless an operator explicitly changes policy state in an authorized workflow.
- If any one node is missing, the mesh reports the missing contribution and keeps a degraded review cue alive.
- If two nodes are missing, the mesh reports below-quorum state and keeps collecting evidence instead of claiming resolution.
- The output is a verification cue, not an engagement, capture, pursuit, or harm instruction.

Run the deterministic smoke check:

```bash
npm run fusion:smoke
```

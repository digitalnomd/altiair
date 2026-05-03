# Distributed Resolution Demo

This scenario is designed so no single Pi, Jetson, operator screen, or cloud path can resolve the event alone. The point of the demo is to prove that Altiair's edge mesh can fuse incomplete observations into a policy-gated training cue during DDIL operation.

There is no single central authority. `altiair-hub` is a preferred display/coordinator when online, but replicated evidence and cached mission context allow any surviving three-node quorum to continue if one node fails. Foundry/CASK can enrich or reconcile later, but the live demo must still work when venue Wi-Fi is removed.

## Four Partial Views

| Node | What It Sees | Why It Cannot Resolve Alone |
| --- | --- | --- |
| `altiair-node-a` | RFID read for a tagged training subject or tagged asset in the zone. | RFID proves presence/identity, but not visual class, activity, or mission relevance. |
| `altiair-node-b` | Audio or micro-observation in the same time window. | Audio is ambiguous and needs identity plus visual/context corroboration. |
| `altiair-orin` | Visual inference from a marker, toy prop, prerecorded clip, or simulated aerial-object cue. | Vision sees an object/marker but cannot connect it to the RFID tag or policy gate. |
| `altiair-hub` | Replicated CASK/Foundry ontology context, mission lane, tag-to-training-entity map, policy rules, and display/coordinator role. | Context is not a fresh observation until the edge nodes provide evidence, and this node is not authoritative. |

Each node's local confidence stays below the resolution threshold. The fused view crosses threshold when at least three surviving nodes contribute replicated evidence. Full four-node operation gives the strongest confidence; one-node failure gives a degraded but still resolvable cue; two-node failure stays below quorum.

## Demo Flow

1. Start the no-router proof path: run logical nodes on the Pi 5/laptop first, then add direct Ethernet/USB or any available LAN only if it is ready.
2. Start the Pi 5 display/coordinator candidate and local node APIs.
3. Trigger the RFID read on `altiair-node-a`.
4. Trigger an audio/motion event on `altiair-node-b`.
5. Trigger the Jetson visual event from a camera frame, marker, toy/static prop, or prerecorded clip.
6. The current coordinator correlates the edge observations with replicated CASK/Foundry mission context.
7. The display shows a policy-gated cue with evidence IDs, confidence, uncertainty, source nodes, and required next checks.
8. Kill one node or the venue uplink. The mesh should elect or retain a surviving coordinator, show degraded mission continuity, and continue local operation.

## Acceptance Criteria

- A single node view never claims resolution.
- The display shows which evidence IDs were contributed by each surviving node.
- The fused cue crosses threshold only when a three-node quorum can correlate RFID, audio/micro-observation, visual inference, and replicated mission context.
- The cue remains `review_needed` unless an operator explicitly changes policy state in an authorized workflow.
- If any one node is missing, the mesh reports the missing contribution and keeps a degraded review cue alive.
- If two nodes are missing, the mesh reports below-quorum state and keeps collecting evidence instead of claiming resolution.
- The output is a verification cue, not an engagement, capture, pursuit, or harm instruction.

Run the deterministic smoke check:

```bash
npm run fusion:smoke
```

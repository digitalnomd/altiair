# Replicated Mission Ledger

Altiair should not keep mission state on only one node. Every reachable node stores the same mission ledger so the mesh can keep operating when a Pi, Jetson, display, hub, or cloud path fails.

## Replicated Everywhere

Every reachable node stores:

- Sensor events from every node.
- Location fixes and RFID/mock-provider location records.
- Visual/audio observations and derived detections.
- Peer intent pings and short-lived role leases.
- Selected-node and tag-plan state.
- Node health and mission-continuity state.
- Upload/sync receipts and policy-gate state.
- Content hashes and references for media.

Raw media follows policy. Metadata, hashes, thumbnails, transcripts, and policy-allowed blobs replicate to all reachable nodes. Disallowed raw media stays local with replicated references so the display can still show provenance without spreading restricted content.

## Failure Rule

The claim is:

> If a record reaches the mesh, every reachable node stores it.

The limitation is:

> If a device is powered off, isolated, or destroyed before its record replicates, the mesh cannot recover data that never left that device.

The demo should therefore create the event, wait for all-reachable-node replication acknowledgement, then isolate or power down a node and show that the surviving nodes still hold the full ledger.

## Multi-Cell Field Pattern

The Pi 5 `Altiair-LAN` is the hackathon's first local network cell. In the field, drones, Hawkeye/vehicle kits, operator compute, or gateway payloads can host, join, or bridge additional LAN cells. The ledger rule does not change: when cells can reach each other, they exchange compact records and ACKs; when cells are partitioned, each cell keeps its local queue and reconciles when contact returns.

## Rust Contract

The production Rust agent should implement:

- SQLite or embedded durable store per node.
- Encrypted-at-rest record payloads.
- Per-record content hash.
- Per-node signature on records created locally.
- Per-peer acknowledgement for every record.
- Retry queue with jitter and backpressure.
- Idempotent insert by content hash and record ID.
- Garbage collection only after retention policy allows it and all required peers have acknowledged.

Run the deterministic check:

```bash
npm run replication:smoke
```

The prototype node API exposes the same networking contract after `POST /bundles`:

- `GET /replication`: policy plus latest replication summary.
- `GET /replication/latest`: full latest replication report, including records and inventories.
- `GET /ledger`: the current node's stored-record view plus all peer inventories.

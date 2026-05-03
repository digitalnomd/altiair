# Altiair Agent

`altiair-agent` is the memory-safe durable node-agent scaffold for the CASK edge mesh. It is written in Rust with `#![forbid(unsafe_code)]` in this crate.

It currently implements:

- `GET /health`
- `POST /bundles`
- `GET /bundles/pending`
- `GET /ledger`
- `GET /records/{record_id}`
- `POST /acks`
- `GET /replication`

Every accepted bundle is stored in SQLite with:

- AES-256-GCM encrypted payload storage.
- SHA-256 content hash.
- Ed25519 signature over the record envelope.
- Idempotent insert by record id and content hash.
- Per-peer acknowledgement rows.
- Bearer-token protection when `ALTIAIR_API_TOKEN` is set.
- Secure default response headers.

Run locally:

```bash
cargo test -p altiair-agent
npm run agent:smoke
```

Demo defaults derive signing/encryption keys from node-local material so the service can run without committed secrets. For real data, set `ALTIAIR_AGENT_SIGNING_KEY` and `ALTIAIR_AGENT_ENCRYPTION_KEY` or their `*_SECRET` variants from local secret storage, not Git.

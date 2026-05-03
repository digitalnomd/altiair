# Security Implementation Plan

This is the security baseline for the Altiair DDIL edge mesh demo. It is written for an unclassified, authorized training environment using consenting tagged training subjects, tagged assets, and controlled training objects. Do not use this repo to process classified information. If a customer brings Controlled Unclassified Information into scope, treat that as a new authorization boundary and map the environment to NIST SP 800-171 and the applicable CMMC level before ingesting that data.

## Source Baseline

- NIST SSDF: secure software development practices for preparing the organization, protecting software, producing well-secured software, and responding to vulnerabilities. Source: https://csrc.nist.gov/pubs/sp/800/218/final
- CISA Secure by Design: manufacturers should own security outcomes, reduce default attack surface, and ship secure defaults. Source: https://www.cisa.gov/securebydesign
- OWASP ASVS: application and API security verification requirements for authentication, access control, validation, cryptography, error handling, and data protection. Source: https://owasp.org/www-project-application-security-verification-standard/
- NIST SP 800-207: zero trust architecture assumes no implicit trust by network location and requires continuous access decisions. Source: https://www.nist.gov/publications/zero-trust-architecture-0
- DoD Zero Trust Strategy: use zero trust as the DoD-aligned operating model for identities, devices, applications, data, networks, automation, and visibility. Source: https://dodcio.defense.gov/Portals/0/Documents/Library/DoD-ZTStrategy.pdf
- NIST SP 800-171 Rev. 3: protection requirements for CUI in nonfederal systems. Source: https://csrc.nist.gov/pubs/sp/800/171/r3/final
- DoD CMMC: contractor cybersecurity assessment model for DoD work where contract terms require it. Source: https://dodcio.defense.gov/CMMC/Model/
- MITRE D3FEND: defensive countermeasure ontology for mapping protection, detection, isolation, hardening, and monitoring controls. Source: https://d3fend.mitre.org/

## Protection Goals

1. Keep credentials, access details, tokens, Foundry URLs, private ontology RIDs, and device private keys out of git.
2. Keep every node useful when cloud access is degraded, but never trusted only because it is reachable on a local link.
3. Protect the mission graph from spoofed or stale sensor events.
4. Keep raw media local by default and forward compact, signed, policy-gated evidence first.
5. Make the LLM advisory only; deterministic policy gates decide what can be shared or surfaced.
6. Make node loss survivable: revoke that node, preserve the local queue on remaining nodes, and keep the operator display clear about degraded state.

## Threat Model

| Risk | Control |
| --- | --- |
| Lost or stolen Pi / Jetson | Unique WireGuard key per node, revocation list, encrypted queue, no committed secrets, short retention, remote Foundry tokens only on gateway nodes. |
| Hostile or curious local-link client | WireGuard overlay, API bound to `wg0` or explicit host, bearer token or mTLS, firewall default deny, no broad CORS. |
| Sensor spoofing or stale RFID read | Tag allowlist, freshness window, confidence and precision fields, multi-sensor corroboration before cue escalation. |
| Malicious bundle or malformed JSON | Body size limits, JSON schema validation, strict content type, reject unknown policy states, fail closed on parse errors. |
| Prompt injection through sensor text or Foundry context | Treat all retrieved/context text as untrusted data, require structured output, reject model commands that bypass policy gates. |
| Gateway overload or data exfiltration | Queue high-water marks, rate limits, summarization before raw media, policy-gated upload, audit logs. |
| Dependency or build-chain compromise | Lockfiles, dependency review, `npm audit`, minimal runtime packages, generated SBOM before customer demo. |
| Unauthorized operator action | Role-based UI affordances, visible policy state, explicit acknowledgement, no engagement planning controls in the MVP. |

## Secure Coding Practices

- Use TypeScript strict typing and explicit domain types for nodes, bundles, policy states, and gateway decisions.
- Validate all external inputs at API boundaries. The Rust service should use schema validation for every route before data reaches business logic.
- Fail closed for authentication, authorization, policy state, missing gateway, and unknown sensor source.
- Keep authorization separate from presentation. The UI may show degraded state and evidence, but it cannot authorize sharing or action by itself.
- Use allowlists for model families, sensor types, node IDs, policy states, bundle priorities, and upload destinations.
- Limit request body size and queue depth before parsing or storing payloads.
- Return generic errors to callers; write detailed diagnostic context only to local protected logs.
- Do not log secrets, bearer tokens, private keys, Foundry URLs, OAuth client secrets, raw RFID identifiers, or raw media paths.
- Add tests for blocked policy states, oversize bundles, stale peer observations, gateway failover, malformed input, and node failure.
- Run `npm run build`, `npm run smoke:mock`, `npm run mesh:smoke`, and `npm audit --omit=dev` before demos; `smoke:mock` is a test harness, not the final live data path.

## Node Hardening

Baseline for every Pi and Jetson:

1. Patch before demo: `sudo apt update && sudo apt full-upgrade -y`.
2. Use unique hostnames and unique OS users. Do not reuse passwords.
3. Enable SSH key auth only; disable password login and root login.
4. Install only required packages: `wireguard-tools`, `sqlite3`, `jq`, sensor utilities, and the node runtime.
5. Enable a default-deny firewall. Allow SSH only from the admin machine, WireGuard UDP from the selected local link, and the Altiair API only on the WireGuard interface.
6. Store app data under a dedicated service user with `0700` directories.
7. Keep device private keys under `0600` permissions and never copy them back into the repo.
8. Rotate WireGuard keys after public demos. Rotate the `Altiair-LAN` SSID password after public demos.

Example firewall posture, adjusted per device:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <admin-ip> to any port 22 proto tcp
sudo ufw allow 51820/udp
sudo ufw allow in on wg0 to any port 8080 proto tcp
sudo ufw enable
```

## Mesh And API Controls

- No external hotspot, router, or internet path is required. Use the Pi 5 `Altiair-LAN` AP as the baseline untrusted underlay; loopback is the software fallback and Jetson Ethernet is the hardware fallback.
- Physical preservation across separate nodes requires the Pi 5 AP or Ethernet fallback before failure. The system can preserve bundles already replicated to another node, but it cannot recover data that existed only on the failed node.
- Use WireGuard as the mission overlay with per-device keys and narrow `/32` `AllowedIPs`.
- Bind the Altiair API to the node overlay address or an explicit host using `ALTIAIR_API_HOST`.
- Set `ALTIAIR_API_TOKEN` for every demo. The prototype requires this token for all non-health routes when configured.
- Prefer mTLS or SPIFFE/SPIRE-style workload identity for a production service; bearer tokens are a demo control, not the final identity layer.
- Keep Foundry/CASK credentials only on nodes with `foundry_gateway` role.
- Sign bundles before forwarding in the production agent. Use per-node Ed25519 keys and include node ID, bundle ID, created time, policy state, and content hash in the signed envelope.

## Data Protection

- Default retention is structured detections, not raw media.
- Raw camera/audio should stay local unless policy allows a bounded thumbnail, transcript, or short clip.
- Store RFID tag IDs as pseudonymous IDs where possible. Keep the tag-to-person or tag-to-asset mapping in Foundry or a protected local file, not in logs.
- Use content hashes for bundle dedupe and tamper evidence.
- Encrypt durable queues before any real customer data is used. For the demo, document whether queue encryption is active or pending.
- Keep policy state attached to every observation, insight, cue, and upload attempt.

## Foundry / CASK Controls

- Use a least-privilege Developer Console backend-service app.
- Separate read scopes from writeback action scopes.
- Keep OAuth secrets in environment variables or the platform secret store, not `.env` files committed to git.
- Keep mock mode as the default for local tests when secrets are absent; final live demos should show queued sync if real Foundry credentials/actions are not loaded.
- Write back evidence, insight drafts, acknowledgements, and node health only after policy checks pass.
- Record upload attempts locally with bundle ID, node ID, selected gateway, policy state, and success/failure, but not secrets or raw content.

## LLM Controls

- The local model drafts explanations and verification checks only.
- The deterministic policy gate remains authoritative for share, hold, review, and block decisions.
- Prompt the model with compact evidence IDs and confidence fields, not large raw data dumps.
- Require structured JSON output and reject outputs with unknown keys, action verbs outside the allowed set, or missing uncertainty.
- Treat Foundry context, transcripts, RFID notes, operator notes, and camera labels as untrusted input.
- Keep engagement controls, pursuit/capture instructions, and harm instructions out of the schema and UI.

## Demo Acceptance Checklist

- `ALTIAIR_API_TOKEN` is set on every node before demo traffic leaves loopback.
- `curl http://10.77.0.10:8080/health` works without secrets and shows no sensitive values.
- Protected routes require `Authorization: Bearer <token>`.
- One Pi can fail and `/mission-continuity` reports `degraded_one_node_failed`.
- Lost-node revocation is demonstrated by removing its WireGuard peer and marking it offline.
- RFID/provider-style location events include freshness, precision/confidence, `isCarrierGrade=false` where applicable, and a policy state.
- Foundry/CASK upload is disabled or queued unless real scopes and secrets are intentionally loaded on a gateway node.
- No repository file contains private keys, tokens, private Foundry URLs, credentials, or access details.

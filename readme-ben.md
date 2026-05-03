# Altair — Hackathon README (Ben's draft)

**Event:** 3rd Annual NatSec Hackathon (Cerebral Valley × Army xTech), Shack15 SF
**Track:** Problem Statement 2 — Edge Deployments and Drone Operation
**Window:** Sat 2026-05-02 11:45 AM → Sun 2026-05-03 12:00 PM
**Team:** Sarah · Benjamin · Rob · Katherine

---

## TL;DR

Three-tier mission C2 for DDIL environments. Phones, a Pi 5 on a battery, and Palantir Foundry. The demo's wow moment: drop the Commander's phone in a Faraday bag mid-pitch — the squad keeps thinking. **Plan = Disciplined MVP by 9 PM Saturday, then layer upside.**

---

## Architecture (locked)

```
TIER 3 — PALANTIR FOUNDRY            (Ontology + AIP Logic + Workshop)
        ▲ HTTPS bearer token (store-and-forward when offline)
TIER 2 — RASPBERRY PI 5 (battery)    (FastAPI + SQLite + Ollama gemma4:e2b
        ▲ wifi LAN                    + GBNF JSON + WebSocket fanout)
        │                              + Danti enrichment client
TIER 1 — SQUAD PHONES                (PWA in mobile Chrome — Leaflet map,
   Commander · Scout · Drone Feed     voice/photo/text capture, WS client)
```

Closed LAN via travel router (AP isolation OFF). mkcert TLS so mobile browsers allow camera/mic. No cloud, no satellite, no internet on the phones.

---

## Inline defaults — flag if any are wrong before 11:45 AM

1. Project name: **Altair** (not Altiair)
2. Repo: `~/code/altair/` → `github.com/<handle>/altair` public
3. Demo phone OS: **Android** (Chrome WebGPU stable; iOS fragile)
4. LLM on Pi: **gemma4:e2b** primary, 4B fallback
5. Voice: **whisper.cpp on Pi** primary; browser Web Speech API fallback
6. **Voice deferred to Sunday morning** for the 9 PM Saturday MVP cut — text + photo only first
7. Foundry SDK: **raw REST API + bearer token** for v1 (skip OSDK code-gen)
8. Map tiles: **OSM pre-cached** for SF + generic terrain
9. Inference fallback: **Ollama on Ben's MacBook** if Pi too slow
10. Spelling: **Altair** everywhere (overrides Discord channel name)

---

## Lane assignments (lock by 12:30 PM)

| Lane | Owner | Owns | First task |
|---|---|---|---|
| **1 — Backend / Pi** | _STRONGEST builder_ | `pi/` | FastAPI scaffold + healthcheck |
| **2 — Frontend / PWA** | _UI dev_ | `web/` | PWA shell + manifest + service worker |
| **3 — Foundry / AIP** | _solo lane_ | `foundry/` | Ontology schema (Sighting/Operator/Threat/Unit) |
| **4 — Networking + Demo + Pitch** | Ben | `demo/` | Travel router config + mkcert verify + smoke test |

---

## Lane 1 — Pi backend

- [ ] 1.1 FastAPI scaffold + healthcheck
- [ ] 1.2 SQLite store + Sighting model
- [ ] 1.3 Ollama + GBNF SALUTE extractor
- [ ] 1.4 WebSocket fanout
- [ ] 1.5 Foundry forwarder + retry queue *(blocked by L3.2)*
- [ ] 1.6 Voice ingestion (whisper.cpp) — *Sunday stretch*
- [ ] 1.7 Danti enrichment client *(blocked by Danti token)*

## Lane 2 — Frontend

- [ ] 2.1 PWA shell + manifest + service worker
- [ ] 2.2 Leaflet map with offline tiles
- [ ] 2.3 WebSocket client with reconnect *(blocked by L1.4)*
- [ ] 2.4 Capture flows (text + photo)
- [ ] 2.5 COP rendering (pins + side panel)

## Lane 3 — Foundry

- [ ] 3.1 Ontology schema (4 objects + 2 links)
- [ ] 3.2 REST API ingestion test (curl + token doc) *(unblocks L1.5)*
- [ ] 3.3 AIP Logic severity classifier
- [ ] 3.4 AIP Logic SITREP generator
- [ ] 3.5 Workshop dashboard

## Lane 4 — Network + demo

- [ ] 4.1 Travel router config (AP-iso OFF)
- [ ] 4.2 mkcert TLS verified on demo phone
- [ ] 4.3 End-to-end smoke test
- [ ] 4.4 Demo rehearsals ×3
- [ ] 4.5 Submission video (1 min, YouTube/Loom)
- [ ] 4.6 Pitch deck backup (5 slides — Q&A only)
- [ ] 4.7 Repo README + GitHub publish

## CASK side-quest — Sarah/Rob lead

- [ ] C.1 Secure CASK kit by 12:30 PM — **kill criteria: not secured = abandon**
- [ ] C.2 OSDK app on CASK — *time-box 4h, drop at 5 PM if not working*
- [ ] C.3 CASK kill-switch demo beat (replaces or augments Faraday bag)

---

## Checkpoints

| When | What |
|---|---|
| Sat 9:00 AM | Mentor walk: Statement 2 + Palantir + Danti. CASK status known. |
| Sat 11:45 AM | Repo init. Lanes locked. .env templated. |
| Sat 12:30 PM | Foundry token live. Codex verified. CASK secured-or-abandoned. |
| Sat 4:00 PM | Each lane shows 30s working clip in Discord. |
| **Sat 9:00 PM** | **MVP CUT** — phones+Pi end-to-end works. Submittable as-is. |
| Sat 9–2 AM | Layered upside: Foundry sync, Danti, voice, CASK |
| **Sun 2:00 AM** | **HARD STOP. SLEEP.** Non-negotiable. |
| Sun 9:00 AM | Three rehearsals at <3:05. Video recorded twice. |
| Sun 11:45 AM | Submitted. |

---

## Demo script (3 min, live, locked)

| t | Action | Said |
|---|---|---|
| 0:00 | Phones face-up, Pi visible w/ battery + router. | "Altair. Statement 2. Attritable mission C2 for DDIL." |
| 0:10 | All phones in airplane mode + local wifi only. | "Starlink jammed. AWS unreachable. Command loop operational." |
| 0:30 | Scout 10 ft away. Snaps photo. Submits SALUTE report. | "Tactical input. Multimodal." |
| 0:50 | Pins appear on Commander + Drone Feed phones simultaneously. | "Local LLM extracted SALUTE. Broadcast to every node." |
| 1:15 | (If Foundry sync done) Workshop dashboard side-monitor catches up. AIP Logic auto-tags severity. | "Uplink up — same picture, command echelon." |
| 1:45 | **Drop Commander's phone in Faraday bag.** Other phones keep updating. | "Lose the leader. Squad keeps thinking." |
| 2:15 | (If CASK secured) Flip CASK kill-switch. Workshop freezes. Pi+phones operational. | "Lose the cloud. Edge keeps thinking." |
| 2:30 | Restore comms. Foundry queue drains live. | "Restore the link. Truth reconciles." |
| 2:50 | "GitHub public. 24 hours, four people. Statement 2." | (Step back.) |

---

## Day-zero mentor questions (Sat 9–11 AM)

**Statement 2 / xTech rep:**
- Is a phone-distributed PWA on a Pi 5 acceptable for example #1, or do you want a hardware reference platform?
- Most important unstructured report a squad needs parsed in DDIL — SALUTE? 9-line MEDEVAC? Frago?
- "No SPOF including squad leader" — real fight or strawman?
- What would make a Statement 2 winner *obviously* a winner in the first 30 sec?

**Palantir Palantirian:**
- **Can we have a CASK kit?** (direct ask — Sarah leads)
- Foundry Ontology REST endpoint shape + bearer token scope?
- Fastest way to wire AIP Logic trigger: new Sighting → severity + SITREP?
- 30 min OSDK pairing around 4 PM?

**OpenAI Codex:** workspace token limits? CLI vs API?

**Danti:** API endpoint + auth scheme today? Tile pre-export?

**Universal (Rob asks every mentor):** *"What makes a Statement 2 winner obviously a winner in the first 30 seconds?"*

---

## Out of scope (do not build)

- ❌ Multi-hop mesh / MANET protocol — local-star only
- ❌ Phone-to-phone P2P — phones talk via Pi
- ❌ Drone swarm coordination
- ❌ RF jamming detection / SDR ingestion
- ❌ Adversary spoofing / offensive cyber
- ❌ Rust rewrite (talking point, not deliverable)
- ❌ Native mobile app (PWA only)
- ❌ On-phone LLM inference in v1 (Sunday stretch only)
- ❌ Kill-chain automation — HITL on every output, always

---

## Risks & mitigations (top 5)

| Risk | Mitigation |
|---|---|
| Foundry token wrong scope | Verify with curl by 11 AM Saturday |
| Ollama gemma4:e2b too slow on Pi | Fallback: Ollama on Ben's MacBook on the LAN, framed as "edge compute node" |
| AP isolation accidentally on at venue | Re-test at 9 AM Sat before commit |
| WebSocket reconnect race during Faraday demo | 3 rehearsals, scripted recovery beat |
| mkcert iOS trust fails | Android primary; iOS as Faraday-victim only |

---

## Q&A prep (for judges)

1. *"Adversaries on your local LAN?"* → mTLS-on-WS, CASK as PKI root, future work
2. *"Why phones over a CASK alone?"* → Already in operators' hands. Lower signature. Replicator doctrine.
3. *"How does this scale to a battalion?"* → Three-tier maps to squad/company/JADC2. Each Pi handles ~12 phones. Multi-Pi sync over MANET.
4. *"What model is running?"* → gemma4:e2b on Pi 5 CPU, GBNF for JSON. ~3-4s/extraction.
5. *"Where's the kill chain?"* → It doesn't live here. HITL on every actionable output.

---

## Submission checklist (Sun 11:45 AM)

- [ ] Public GitHub repo, MIT license, 4 contributors listed
- [ ] README with tagline · problem statement · architecture diagram · partner integrations · video link
- [ ] 1-min video uploaded to YouTube (unlisted) or Loom
- [ ] Submission form filled at Cerebral Valley
- [ ] Discord post in `#altiair` announcing submission

---

*Full engineering spec lives at `~/.openclaw/workspace/business/research/altair-spec.md` on Ben's machine. This is the team-facing summary — the spec has acceptance criteria, test plans, and rollback for every task.*

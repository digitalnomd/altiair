# DarkMesh: Resilient Edge Intelligence for Contested Operations

---

## TAGLINE

> DarkMesh turns a squad's scattered sensors into a single fused intelligence picture — locally, without cloud, without a central command node — and keeps the mission running even when nodes go dark.

---

## SECTION 1 - THE PAIN
**Goal: make the problem visceral before you mention your product**

Imagine you have 4 soldiers in the field. One sees a drone. Another hears a rotor sound. A third gets an RF ping. 
- How do you connect and make sense of these scattered signals, and fuse them under fire, degraded comms, and in real time.
- The current solution either ships everything to cloud (which dies the moment the network is jammed) or relies on one central node device to coordinate the whole squad. Take out the leader, and the squad goes out.
- squads lose their shared intelligence picture the moment their network or coordinator goes down."

---

## SECTION 2 — WHAT WE BUILT
**Goal: one clean architecture statement. No jargon overload.**

- We built DarkMesh to solve this
> DarkMesh turns a squad's scattered sensors into a single fused intelligence picture — locally, without cloud, without a central command node — and keeps the mission running even when nodes go dark.

- Each soldier is a node in the field: raspberry pi runing camera, microphone, RF sensors, and Jerson running a local lightweight AI model, catching what is being seen and heard in the field.
- These signals get shared across an encrypted local WiFi mesh between every soldier's node, putting together a coherent, full picture of what's happening.
- A coordinator LLM is elected to fuse all signals and issue per-node instructions toward the stated mission objective

---

## SECTION 3 — LIVE DEMO: NORMAL OPERATION

Demo sequence — show in this exact order:
1. Dashboard opens: tactical map, 4 nodes live, all green, local-only
2. Node 1: camera — YOLO detects drone marker, confidence appears on card
3. Node 2: audio — "rotor sound detected" populates
4. Node 3: RF — "2.437GHz DJI primary band" signal appears
5. Fusion bar rises: 3 signals → single assessment: **"Drone, bearing 047°, confidence 88%"**
6. Coordinator LLM fires per-node instructions:
   - Node 1: "Maintain visual lock, bearing 047"
   - Node 2: "Reposition south 100m, scan treeline"
   - Node 3: "Confirm RF signal movement direction"

Narrate:
- "Four squad members, four weak signals. Alone — noise. Together — one explainable threat picture with 88% confidence."
- "The coordinator LLM doesn't just say *something's there*. It tells each soldier what to do about it, based on their position real-time data, and the mission objective."
- "No raw video going to the cloud. Filtered at the edge. Shared as compact evidence."

**Delivery note:** Point at the hardware on the table while narrating. "This is running on that." Physical hardware = credibility. Don't just gesture at the screen.

---

## SECTION 4 — THE KILL MOMENT
**Goal: the single moment judges remember when they vote. Slow down here.**

Setup line:
- "Now we simulate the failure that breaks every traditional system."
- "Most teams demo this in software simulation. We built it in hardware, running live."

Action: **physically unplug Node 1**. Say nothing for 2 full seconds. Let judges watch.

On screen they see:
- Node 1 → **[DARK]**
- Heartbeat missed indicator
- "Coordinator re-electing..." flashes
- Node 2 assumes coordinator in < 1 second
- Cue queue intact — same threat, same bearing, same objective
- Per-node instructions resume, updated for new coordinator position
- Foundry sync remains queued

Narrate:
- "Node 2 detected the missed heartbeat."
- "It already had the full mission state — because state lives on every node simultaneously, not in one command node."
- "New coordinator elected. Instructions resume. The operating picture survived."

**Punchline — say it slowly:**
> "The commander can be taken out. The mission cannot."

**Delivery note:** Stop after the punchline. Do not add qualifiers. Do not explain it further. The silence after it is part of the delivery.

---

## SECTION 5 — PALANTIR / FOUNDRY
**Goal: 10 seconds, targeted at Palantir and IQT judges specifically**

Say:
- "Offline, we run CASK at the edge — Foundry's local brain. Same ontology, same data contracts, no internet required."
- "When any node regains connectivity, the full record syncs to Foundry automatically: every sensor event, every fusion decision, every coordinator term."

**Delivery note:** Look at the Palantir judges when you say "Foundry's local brain." You're telling them: we're not competing with you — we're extending you to places you can't reach.

---

## SECTION 6 — CLOSE
**Goal: 8 seconds. One line. Stop.**

> DarkMesh is not a research concept. It is a working system, running on cost-efficient hardware, solving the exact problem DARPA and Army XTech have flagged as open in the field.

FINAL LINE: The commander can be taken out. The mission cannot.


---

## Q&A — LIKELY QUESTIONS + ANSWERS

**"How does this differ from existing mesh radio systems like ATAK?"**
- ATAK moves location tracks. We move *intelligence* — fused, filtered, evidence-grounded cues. We're not replacing the radio layer, we're adding the reasoning layer on top of it.

**"What's the latency?"**
- Fusion cycle runs every 1-3 seconds. Coordinator re-election under 1 second. Fast enough for counter-UAS cueing, not fast enough for kinetic fire control — and we're not claiming it is.

**"Is this secure?"**
- Local encrypted mesh, WireGuard overlay, no data leaves the node without policy gate. No cloud dependency means no cloud attack surface.

**"How do you scale beyond 4 nodes?"**
- The gossip + Raft architecture scales linearly. More nodes = more evidence = higher confidence, not more fragility. The coordinator election handles any N.

**"Why not just use a cloud backend?"**
- Because DDIL environments exist precisely to deny that. Ukraine has taught the Army that cloud-dependent C2 dies in contested environments. This works when nothing else does.

---


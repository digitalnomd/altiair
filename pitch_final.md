# DarkMesh: Resilient Edge Intelligence for Contested Operations


---

## TAGLINE

> DarkMesh turns a squad's scattered sensors into a single fused intelligence picture — locally, without cloud, without a central command node — and keeps the mission running even when nodes go dark.


---

## THE PAIN
**Goal: make the problem visceral before you mention your product**

- Squads today are **sensor-rich but coordination-poor**
- One soldier sees a drone. Another hears rotor sound. A third gets an RF ping. A fourth files a report.
- Four signals. No fusion. The squad leader mentally stitches it together — under fire, in a jammed network, with degraded comms.
- And if the coorination node goes down? **The picture fragments. The squad goes dark.**
- Army XTech solicited solutions for this exact problem. DARPA funded a program for it two weeks ago. It is still unsolved in the field.

**Delivery note:** Pause after "the squad goes dark." Let it sit one beat. Then move.

**What NOT to say:** Do not say DDIL yet. Do not explain the acronym. Judges know it. Saying it sounds like you're padding.

---

## SECTION 2 — WHAT WE BUILT (0:20–0:38)
**Goal: one clean architecture statement. No jargon overload.**

Say:
- DarkMesh is a **low-cost edge intelligence mesh** — each soldier carries a node: Raspberry Pi for sensor I/O, Jetson for local AI inference
- Camera, microphone, RFID — all processed **locally**. No cloud required. No raw video streaming upstream.
- Nodes share only compact evidence — not full sensor feeds — across an encrypted local mesh
- A coordinator LLM is elected to fuse all signals and issue per-node instructions toward the mission objective
- **Existing systems require either cloud OR a centralized command node. We eliminated both assumptions.** ← say this clearly, it's your creativity answer (25% of score)
- This is not a replacement for IVAS, Nett Warrior, or Palantir. It is the **missing edge layer** that feeds them. At ~$400/node vs $80K/IVAS kit — it scales to every squad member.
- When connectivity returns: everything syncs to Palantir Foundry via CASK — Foundry's local data contract running at the edge, same ontology, no internet required offline.

**Delivery note:** The cost comparison ($400 vs $80K) is a one-liner, not a slide. Say it fast and move. Don't dwell — you're not pitching cheapness, you're pitching scalability.

---

## SECTION 3 — LIVE DEMO: NORMAL OPERATION (0:38–1:08)
**Goal: chaos → fusion → action. Show it, narrate it minimally.**

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
- "The coordinator LLM doesn't just say *something's there*. It tells each soldier what to do about it, based on their position."
- "No raw video going to the cloud. Filtered at the edge. Shared as compact evidence."

**Delivery note:** Point at the hardware on the table while narrating. "This is running on that." Physical hardware = credibility. Don't just gesture at the screen.

---

## SECTION 4 — THE KILL MOMENT (1:08–1:42)
**Goal: the single moment judges remember when they vote. Slow down here.**

Setup line:
- "Now we simulate the failure that breaks every traditional system."
- "Most teams demo this in software simulation. We built it in hardware, running live." ← hits creativity criterion directly

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

## SECTION 5 — PALANTIR / FOUNDRY (1:42–1:52)
**Goal: 10 seconds, targeted at Palantir and IQT judges specifically**

Say:
- "Offline, we run CASK at the edge — Foundry's local brain. Same ontology, same data contracts, no internet required."
- "When any node regains connectivity, the full record syncs to Foundry automatically: every sensor event, every fusion decision, every coordinator term."
- "The edge is ephemeral. The intelligence is permanent."

**Delivery note:** Look at the Palantir judges when you say "Foundry's local brain." You're telling them: we're not competing with you — we're extending you to places you can't reach.

---

## SECTION 6 — CLOSE (1:52–2:00)
**Goal: 8 seconds. One line. Stop.**

> "DARPA called this an open problem. Army XTech solicited it. JADC2 mandates it. We demo'd it this weekend."

Full stop. Do not add anything after it.

**Delivery note:** If you want a shorter version: *"The commander can be taken out. The mission cannot."* — use this if the kill moment demo went perfectly and you want to call back to it. Use the DARPA/XTech/JADC2 line if you want to hit every judge in the room by name.

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

## SCORING MAP — HOW THIS PITCH HITS EACH CRITERION

| Criterion | % | Where it lands in pitch |
|---|---|---|
| Technical Demo | 35% | Live YOLO + fusion + kill moment on real hardware |
| Military Impact | 30% | Army doctrine gap + XTech solicitation + JADC2 mandate + operator validation |
| Solution Creativity | 25% | "We eliminated cloud AND single command node" + hardware kill demo (not simulation) |
| Presentation & Pitch | 10% | Chaos→fusion→action arc + hardware on table + clean punchline |

---

## WHAT TO HAVE ON THE TABLE

- Jetson Nano + RPi physically visible — not hidden in a bag
- One node physically unplugable mid-demo (test the cable 10x before)
- Dashboard on a large screen, not a laptop lid
- Hardware labeled: "Node 1", "Node 2" etc — judges need to match physical to screen

---

## ONE LINE TO WRITE ON THE HARDWARE

**"No cloud. No single point of failure. No data lost."**

Judges walking past the table before judging starts will read it. It does work before you open your mouth.
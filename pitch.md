
Altiair: Resilient Edge Intelligence for DDIL Operations

We built the tactical intelligence layer that keeps a squad operational after their command node is destroyed."

---

Opening - the PAIN:
>  A squad in a jammed or cloud-denied battlefield has multiple sensors seeing different things. One soldier sees a drone. Another hears a sniper. A third gets an RF ping. Right now, the squad leader mentally stitches that together under fire. And if the central command node goes down — the whole unit fails. DARPA just issued a $50M program two weeks ago because this is unsolved. We solved it on $200 of hardware."


---
What we built:
> Altiair turns disconnected soldier nodes into a resilient tactical edge mesh: it fuses sensor evidence gathered from across the field into one coherent picture, processes it using intelligence, and coordinates the team toward the mission goal, and keeping the mission operational when a node dies.

Each node is a soldier. Raspberry Pi handles sensor I/O — camera, microphone, RFID. Jetson Nano runs the AI locally. No cloud required. Nodes communicate on a local encrypted mesh — fully operational in contested, jammed, or disconnected environments. When connectivity exists, it syncs directly to Palantir Foundry for commander visibility and after-action replay. When it doesn't — nothing is lost. Every node already has the full mission state."


---
Live Demo:

Dashboard opens — tactical map, 4 nodes live, all green
Camera feed active — YOLO detects object, visual confidence updates live on dashboard
Audio detection fires — "rotor sound detected" populates on Node 2's card
RF signal appears — "2.437GHz, DJI primary band" confirms on Node 3
Fusion confidence bar rises — 3 signals → single fused assessment: "Drone, bearing 047°, confidence 88%"
Coordinator LLM fires — per-node instructions appear:
- Node 1: "Maintain visual lock, bearing 047"
- Node 2: "Reposition south 100m, scan treeline"
- Node 3: "Confirm RF signal movement direction"

Narrate it like this:
> "Three nodes, three signals. Individually — noise. Together, the fusion layer produces a single threat picture with 88% confidence. The coordinator LLM then issues specific orders to each soldier. Not 'something's there' — but what to do about it, tailored to each node's position."

Why this order matters: You go chaos → fusion → action. That arc is the product. Judges see it happen in real time.

---
The KILL moment:
> Now we simulate the failure every traditional system fails on. The command node — Node 1, the current coordinator — goes down.

Physically unplug Node 1 or kill it on screen.
Pause two seconds. Let judges watch.
On screen, they should see:

- Node 1 card goes gray → [DARK]
- Heartbeat missed indicator
- "Coordinator re-electing..." flashes
- Node 2 assumes coordinator (< 1 second)
- Per-node instructions resume — slightly updated to reflect new picture
- Mission state preserved — same threat, same bearing, same objective

> Node 2 detected the missed heartbeat. It already had the full mission state — because that state lives on every node simultaneously, not just the coordinator. New leader elected. Instructions resume. **The mission doesn't know the coordinator died.**

Punchline: "That is the architectural difference. Centralized systems die when the command node dies. Altiair doesn't have a command node."

---
Palantir - After Action
> When any node regains secure connectivity, the full mission record — every sensor event, every fusion decision, every coordinator directive — syncs to Palantir Foundry. 


Offline, we're running CASK on edge — think of it as Foundry's local brain, operating on the nodes themselves when cloud access is gone. Same ontology, same data contracts, no internet required. 
---

What 1st place does: Makes the judges feel the operational pain, then solves it live in front of them with a moment they can't forget.

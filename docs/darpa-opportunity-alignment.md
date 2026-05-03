# DARPA Opportunity Alignment

As of May 3, 2026, the directly relevant DARPA program language is Mission-Integrated Network Control (MINC), with SHARE and EdgeCT as supporting prior art. I did not verify an open, active MINC RFP today. DARPA's active SBIR/STTR page currently lists active 2025.4 topics and pre-release/opening 2026 BAA topics, but no direct DDIL edge-mesh / mission-integrated network-control SBIR topic.

## Best Direct Fit: MINC

DARPA's Mission-Integrated Network Control (MINC) is the strongest technical fit for Altiair's DDIL mesh:

- Objective: ensure critical data finds a path to the right user at the right time in highly contested, highly dynamic communications environments.
- Interoperability: develop approaches that work with heterogeneous legacy and future systems.
- Architecture: always-on network overlay, cross-network optimization, and mission-driven critical information flows.
- Operating model: translate mission objectives into network management policies so self-healing networks adapt as mission and operational conditions change.

Source: https://www.darpa.mil/news/2022/minic-data-flow-contested-environment

The original MINC BAA appears as HR001121S0028 in third-party records. That BAA is not the current active SBIR path, but it is the right citation for the technical thesis and terminology.

## Supporting DARPA Prior Art

SHARE is the closest transition precedent for secure tactical-edge data sharing:

- DARPA says SHARE enabled secure and resilient information sharing between U.S. forces and allied partners in tactical operations.
- It specifically reduced reliance on fixed infrastructure and supported sharing over military or commercial networks.
- It transitioned into the TAK ecosystem.

Source: https://www.darpa.mil/news/2023/communications-tactical-edge

EdgeCT is older and complete, but it is directly useful for framing mission-aware edge network adaptation:

- It focuses on reliable mission communication despite hardware/software failures, route convergence delays, DoS, and control/data-plane attacks.
- It names real-time network analytics, holistic mission-aware decisions, and dynamically configurable protocol stacks.
- It explicitly avoids requiring WAN or encryption-boundary changes.

Source: https://www.darpa.mil/research/programs/edge-directed-cyber-technologies-for-reliable-mission-communication

PWND2 is active-adjacent, not the main fit:

- DARPA lists opportunity HR001124S0037 for Provably Weird Network Deployment and Detection.
- Its focus is formal models and analysis of hidden/emergent communication pathways, not mission-command DDIL edge fusion.

Source: https://www.darpa.mil/research/programs/provably-weird-network

## CJADC2 Edge-Fusion Framing

A Military Embedded Systems article by Dominic Perez of Curtiss-Wright is not a DARPA solicitation, but it is useful CJADC2 market framing:

- CJADC2 requires interoperability across land, air, sea, space, and cyberspace.
- Sensor fusion at the edge reduces dependence on centralized data centers in communications-denied environments.
- Edge systems should store battlefield data locally and forward it to a data warehouse when connectivity allows.
- Key implementation challenges are data standardization, security/encrypted communication, and scalability as sensors increase.

Source: https://militaryembedded.com/ai/machine-learning/cjadc2-interoperability-ai-ml-based-sensor-fusion-at-the-edge

Altiair maps directly to that framing through typed sensor bundles, local store-and-forward, WireGuard-encrypted node traffic, gateway scoring, and policy-gated Foundry/CASK writeback.

## Active SBIR Reality Check

DARPA's current SBIR/STTR topics page says SBIR/STTR was reauthorized as of April 13, 2026 and lists active topics:

- DoW SBIR 2026 BAA topics: pre-release April 13, 2026; open May 6, 2026; close June 3, 2026.
- SBIR 2025.4 topics: open April 13, 2026; close May 13, 2026.
- The only missionized-autonomy active topic on that page is "ALIAS Missionized Autonomy for Emergency Services - SBIR XL", initially focused on wildfire response with autonomous MUM-T and integrated sensing. It is adjacent for autonomous mission operations, but not a DDIL mesh-network RFP.

Source: https://www.darpa.mil/work-with-us/communities/small-business/sbir-sttr-topics

## How Altiair Should Tie In

Proposal thesis:

Altiair is a small-business prototype of MINC-style mission-integrated edge networking for DDIL operations. It demonstrates an always-on overlay across commodity edge nodes, mission-aware gateway selection, store-and-forward evidence bundles, and failure-tolerant local fusion when one node or the cloud path drops.

## Support Targets To Track

These are the most relevant programs or acquisition paths to support, in priority order.

### 1. CDAO Open DAGIR / Tradewinds / Maven Smart System

This is the best immediate Palantir-adjacent path. CDAO describes Open DAGIR as a competitive acquisition and architecture approach for rapidly procuring and integrating best-in-class technology while ensuring interoperability. Tradewinds is CDAO's acquisition ecosystem for emerging AI, data, and analytics capabilities across the Department of War.

Palantir states that Maven Smart System is part of NGA's Maven AI infrastructure and provides cloud infrastructure, software capabilities, and AI that powers CDAO's CJADC2 initiatives. Palantir also states Maven connects operators, sensor feeds, platforms, hardware/software, and algorithms.

Altiair support angle:

- DDIL edge ingest for Maven/CASK/Foundry-compatible bundles.
- Local store-and-forward when cloud, Maven, or enterprise API paths are unavailable.
- Standardized sensor-event and node-health schemas for Open DAGIR interoperability.
- Policy-gated evidence packets, not autonomous engagement actions.
- Edge continuity metric: what survives when one node, one gateway, or one uplink fails.

Sources:

- https://www.ai.mil/Initiatives/Open-DAGIR/
- https://www.tradewindai.com/
- https://palantir2020ipo.q4web.com/news-details/2024/Palantir-Expands-Maven-Smart-System-AIML-Capabilities-to-Military-Services/default.aspx

### 2. Army NGC2 / PEO C3N

The Army announced a $99.6 million NGC2 prototype OTA to Team Anduril for an integrated and scalable C2 suite across hardware, software, and applications through a common integrated data layer. The team includes Palantir, Striveworks, Govini, Instant Connect Enterprise, Research Innovations, and Microsoft. The Army also said it was executing additional competition through a Commercial Solutions Opening.

PEO C3N later described the relevant NGC2 mission as an integrated, AI/ML-enabled, threat-informed, scalable, resilient, converged and meshed data platform with capacity at each echelon for DDIL tactical environments, plus modular secure compute and store capabilities in the cloud and at the tactical edge.

Altiair support angle:

- Tactical-edge micro-mesh for NGC2 common-data-layer ingest.
- Raspberry Pi / Jetson proof rig for fast DDIL sprint demos.
- `GET /mission-continuity` style health-to-mission-state adapter.
- Optional TAK/CoT and CJADC2 COP export boundaries.
- Security-focused third-party app posture: signed bundles, audit records, constrained APIs, and no opaque raw-media flood.

Sources:

- https://www.army.mil/article-amp/287180/army_announces_next_generation_command_and_control_ngc2_prototype_award
- https://www.army.mil/article/289377/major_reorganization_for_peo_c3n_supports_army_approach_to_next_generation_command_and_control

### 3. DARPA DICE

DICE is a current DARPA I2O future-program / proposers-day track for decentralized AI through controlled emergence. DARPA says it is targeting decentralized coordination, local inference control, heterogeneous AI agents, resilience to failure or compromise of individual agents, and predictable alignment with intent. DARPA also states DICE will use simulation environments and does not include real-world autonomous-system deployment.

Altiair support angle:

- Simulation/testbed for decentralized edge-agent continuity.
- Mission-control scoring under benign node loss and adversarial node compromise scenarios.
- Controlled local inference boundaries for small edge agents.
- Evidence-only and human-review constraints as alignment guardrails.

Sources:

- https://www.darpa.mil/research/programs/decentralized-artificial-intelligence-through-controlled-emergence
- https://www.darpa.mil/work-with-us/opportunities/darpa-sn-26-72

### 4. DARPA MINC, SHARE, and EdgeCT

These are the strongest DARPA technical-lineage citations, but not verified today as open funding paths:

- MINC: mission-integrated network control for critical data delivery in contested environments.
- SHARE: secure, resilient data sharing at the tactical edge, transitioned into TAK.
- EdgeCT: mission-aware edge analytics and protocol adaptation for reliable mission communication.

Altiair support angle:

- Claim technical continuity, not current award eligibility.
- Use them to justify why edge networking must be mission-aware rather than just link-aware.

Sources:

- https://www.darpa.mil/news/2022/minic-data-flow-contested-environment
- https://www.darpa.mil/news/2023/communications-tactical-edge
- https://www.darpa.mil/research/programs/edge-directed-cyber-technologies-for-reliable-mission-communication

### 5. DARPA SMART SBIR as a Past Topic Pattern

SMART is closed, but it closely matches a possible future SBIR framing: real-time RF spectrum awareness for dismounted tactical ground units using SDR and handheld/tablet compute, with emphasis on interoperability, scalability, and not increasing physical or cognitive burden.

Altiair support angle:

- Watch for re-release or adjacent spectrum-awareness topics.
- Keep RF/spectrum ingest as an optional sensor plugin, not a primary dependency.
- Preserve "no additional cognitive burden" in UI and alert design.

Source:

- https://www.darpa.mil/research/programs/smart

Concrete SBIR/BAA framing:

- Use MINC as the direct technical lineage.
- Use SHARE as the transition/interoperability precedent for tactical-edge sharing and TAK-style ecosystems.
- Use EdgeCT as the mission-aware networking design precedent.
- Use the active DARPA SBIR/STTR page as the route-to-funding citation, while being precise that the current listed topics do not exactly equal MINC.
- If a DARPA open topic or SBIR open-topic path becomes available, position Altiair as: "mission-integrated network control and local intelligence fusion for DDIL edge operations using low-SWaP compute."

Do not claim there is an active MINC SBIR unless a current DARPA/SAM.gov posting is found.

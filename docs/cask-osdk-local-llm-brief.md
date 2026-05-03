# CASK OSDK and Local LLM Brief

Date: 2026-05-02

Project lead: Sarah Hatcher.

## Working Assumptions

- CASK means Palantir's CASK capability, with Foundry as the governed source of mission data.
- Raspberry Pi hardware includes two Raspberry Pi 4 Model B edge nodes and one Raspberry Pi 5 hub candidate.
- No Chinese-origin model families should be used. Excluded examples: Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, InternLM.
- The local LLM is advisory. It should produce structured insight drafts with evidence, confidence, and limitations; it should not be the only control path for mission-critical decisions.
- The initial demo should use authorized tagged training subjects, tagged assets, or controlled training objects. It should provide situational awareness and non-kinetic coordination guidance, not instructions to harm, capture, or attack a real person.
- The location feed should model the shape of provider-style RF/LTE telemetry using live Arduino/RFID reads. It must label that feed as RFID-derived, coarse-grained, and not carrier-grade.
- Team data ideas and context candidates should be collected in the shared Google Drive folder and treated as a future RAG/LLM context corpus after review.
- Army feedback sharpens the demo around counter-UAS cueing: detect low-cost or operator-controlled drone activity, estimate an attributable control-source zone from evidence, and put a policy-gated cue into a human review queue. Do not encode target prosecution, engagement planning, or harmful action instructions.
- The operator-interface target is EagleEye-style headborne C2. The MVP should use a Pi-hosted display shell as an emulator for the cue overlay and acknowledgement flow unless real EagleEye/Lattice access is provided. Phones are fallback viewers only.
- The edge agent should be Rust-first for queueing, mesh transport, congestion control, and upload reliability. Sensor adapters can prototype in Python if they emit the same JSON contracts.
- The local LLM is also a control-plane filter: it can summarize, dedupe, prioritize, and hold bundles, but deterministic Rust rules remain authoritative when the model is unavailable or invalid.

Shared context drop:

- National Security Hackathon - Altiair shared Google Drive: https://drive.google.com/drive/folders/1hRTFxmv2g1PxKLg1U8fvUuWTxWWHIGql?usp=sharing

Do not place credentials, private Foundry URLs, client secrets, uncontrolled raw media, or sensitive personal data in the shared Drive.

## Architecture Shape

```mermaid
flowchart LR
    Foundry["Foundry Ontology / OSDK"] --> Sync["CASK sync service"]
    Sync --> Cache["Local governed cache"]
    Drive["Shared Drive context corpus"] --> Context
    Camera["Camera"] --> Pi4["2x Pi 4 Model B edge nodes"]
    Mic["Microphone"] --> Pi4
    RFID["RFID reader"] --> Pi4
    RFID --> ProviderLoc["Provider-style RFID location event"]
    Pi4 --> Mesh["Edge node mesh"]
    ProviderLoc --> Mesh
    Pi5["1x Pi 5 hub candidate"] --> Mesh
    Mesh --> Fusion["Sensor fusion and anomaly logic"]
    Fusion --> Filter["Local LLM/rules filter"]
    Filter --> Guard["Congestion guard"]
    Cache --> Context["RAG/context builder"]
    Guard --> Context
    Context --> LLM["Local LLM runtime"]
    LLM --> Insight["Structured insight draft"]
    Insight --> Chest["Pi-hosted display shell\nEagleEye-style cue emulator"]
    Insight -.-> EagleEye["EagleEye / headborne C2 display"]
    Insight --> Review["Operator review / policy gates"]
    Review --> Foundry
```

The edge path should be deterministic before it is generative: validate telemetry, normalize units, calculate thresholds and anomaly scores, then ask the LLM to explain and prioritize what the deterministic layer already surfaced.

## Foundry OSDK Information To Gather

Create or identify two Developer Console applications:

- `cask-edge-service`: backend service / confidential OAuth client for the Pi-side daemon. This service should use a service user and scoped access to only the Ontology resources needed for sync and writeback.
- `cask-operator-console`: optional client-facing React application. This must not store client secrets. If hosted on Foundry, it is static SPA hosting only.

Required values from Foundry:

- Foundry stack URL.
- Ontology RID.
- Generated OSDK package name and package index URL.
- Application type and OAuth grant path for the edge service.
- Client ID and secret delivery path for the Pi, stored outside git.
- Object types to read: missions, assets, sensors, cameras, microphones, RFID readers, RFID tags, location feeds, edge nodes, observations, alerts, tasks, relevant reference data.
- Object/action types to write: camera events, transcript/audio events, RFID scan events, provider-style location events, location fixes, insight drafts, node health, incident annotations, operator decisions, action logs.
- Counter-UAS object/action candidates: drone observations, drone tracks, control-source estimates, counter-UAS cue packages, evidence queue items, policy gates, operator acknowledgements, and action logs.
- Functions or AIP Logic functions to call, if any.
- Markings, roles, organizations, and service-user access for all objects.
- Application maximum scope and requested operation scopes, especially Ontology read/write.

Recommended local schema boundary:

- `Observation`: raw or normalized sensor event with source node, timestamp, unit, value, quality, and Foundry object references.
- `CameraEvent`: frame-derived observation with camera ID, detected class, bounding region, confidence, frame time, optional thumbnail reference, and retention policy.
- `AudioEvent`: microphone-derived observation with VAD window, transcript text, ASR confidence, detected keywords/classes, and optional redacted audio reference.
- `RfidEvent`: reader-derived observation with reader ID, tag ID, antenna/zone, RSSI if available, read count, timestamp, and matched Foundry asset/person reference.
- `ProviderStyleLocationEvent`: Arduino RFID-derived event shaped like future RF/LTE provider telemetry, with provider/source, carrier-grade flag, zone or coordinate, precision radius, confidence, freshness, and raw reader evidence.
- `LocationFix`: normalized location estimate produced from RFID, provider-style telemetry, camera, microphone, or manual input.
- `Anomaly`: deterministic finding with rule ID, score, threshold, and related observations.
- `TrackEstimate`: tracked subject or asset estimate with entity ID, zone, confidence, freshness, supporting events, and conflicting evidence.
- `DroneObservation`: drone class, detection source, zone or bearing, confidence, media reference, timestamp, and suspected role such as commercial quadcopter, low-cost one-way drone, decoy, or unknown.
- `ControlSourceEstimate`: likely controller or launch-area estimate with confidence ring, freshness, supporting observations, contradictions, and policy state.
- `CounterUasCue`: human-reviewed cue package linking drone observations, control-source estimate, evidence, confidence, policy gate, and acknowledgement state.
- `PolicyGate`: policy or rules-of-engagement status such as collect-only, review-needed, authorized-to-share, or blocked.
- `NodePing`: mesh notification with track estimate ID, confidence tier, affected zone, and display priority.
- `InsightDraft`: LLM-authored explanation with citations to observations and Foundry object IDs.
- `NodeHealth`: Pi status, mesh connectivity, clock drift, queue depth, model/runtime status.

## Demo Flow

The first full demo should show the following loop:

1. Operators use Pi-backed edge nodes with RFID readers, cameras, and microphones.
2. Each node processes local inputs into compact `CameraEvent`, `AudioEvent`, and `RfidEvent` records.
3. Arduino RFID reads also generate `ProviderStyleLocationEvent` records so the pipeline matches the structure of future RF/LTE provider location data.
4. Nodes exchange event summaries across the mesh, with store-and-forward behavior when connectivity is degraded.
5. RFID and provider-style location events ground the location estimate for an authorized tagged training subject or tagged asset.
6. Camera and microphone events either corroborate, contradict, or add context to the location estimate.
7. The Pi 5 hub or elected edge hub builds an evidence bundle and asks the local LLM for an explanation and coordination draft.
8. The system sends a `NodePing` to relevant edge nodes when a high-confidence track estimate changes.
9. Operators view the fused state on a Pi-built EagleEye-style display shell, Pi-attached screen, or chest-worn field computer.
10. For the counter-UAS variant, operators see a cue queue containing drone observations, likely control-source zone, confidence, contradictions, and policy state.
11. The Pi-hosted UI presents those cues using an EagleEye-style overlay so the same data contract can later feed headborne C2.

The LLM should recommend non-kinetic coordination only: coverage gaps, search areas, sensor repositioning, deconfliction, confidence limits, policy state, and next verification checks. It should not recommend target prosecution, engagement, or harm against a person.

## Counter-UAS Cueing Variant

Army feedback points the demo toward "find the drone operator" as an evidence-cueing problem, not an autonomous targeting problem. The safe implementation is:

1. Detect a drone event from camera, microphone, operator report, or imported Foundry/sandbox context.
2. Classify the drone class at a high level: DJI-style commercial quadcopter, Shahed-style low-cost one-way drone, decoy drone, or unknown.
3. Correlate detections with RFID/provider-style location, observer reports, mesh topology, and Foundry context.
4. Estimate a likely control-source or launch-area zone with explicit confidence, precision, and freshness.
5. Create a `CounterUasCue` with evidence links and a `PolicyGate`.
6. Broadcast the cue to edge nodes and the operator display only when deterministic thresholds and policy checks pass.
7. Require human acknowledgement before any consequential downstream action.

Map layers:

- Drone observations by class, confidence, timestamp, and source sensor.
- Likely control-source or launch-area estimate with confidence ring and freshness.
- Sensor coverage, blind spots, and stale areas.
- Decoy/spoof suspicion when observations conflict.
- Policy status and review queue state.
- CASK/Foundry sync and acknowledgement state.

Demo language:

- "Find the operator" means estimate and explain an attributable control-source zone from evidence.
- "Queue" means an evidence and policy review queue for authorized humans.
- "Unjammable" should be stated as DDIL-resilient or jam-resilient. Do not claim the system is literally unjammable.
- The Faraday bag/cage demo isolates one display client or cloud path while the Pi/CASK edge continues to queue, sync locally, and inform nearby operators.
- "EagleEye integration" means the demo emits cue objects and renders them in a Pi-hosted display shell that resembles headborne mission-command overlays. Do not claim direct EagleEye access unless it is actually granted.

## Consolidated Workflows

Use these workflows as the implementation map:

| Workflow | Owns | First output |
| --- | --- | --- |
| Edge node agent | Rust service, health, peer status, durable queue, bundle API. | `GET /health`, `GET /peers`, SQLite bundle table. |
| Sensor ingest | Camera, microphone, RFID, and provider-style location adapters. | Typed `CameraEvent`, `AudioEvent`, `RfidEvent`, and `ProviderStyleLocationEvent`. |
| Filtering and congestion | Local LLM/rules decisions, priority, dedupe, gateway saturation checks. | `POST /bundles/{bundle_id}/decision`, `GET /congestion`, deterministic fallback. |
| Foundry/CASK sync | OSDK app, ontology mapping, uploader, acknowledgement receipts, queued local fallback. | `POST /foundry/upload` returns an OSDK ack or explicit pending-sync receipt. |
| Pi-hosted EagleEye-style UI | Display shell, cue overlay, evidence drawer, policy gate, acknowledgement. | Display renders mesh health, observations, `CounterUasCue`, and policy state. |
| Demo and evaluation | Scenario data, constraints, smoke tests, pitch beats. | End-to-end local demo with queued sync recovery. |

## Sensor Input Strategy

Camera:

- Prefer local computer vision and frame sampling before invoking the LLM.
- Store structured detections first; store raw frames or clips only when policy and retention rules allow it.
- For Pi 5 with AI HAT+ or AI Camera, use hardware-accelerated object detection where available.
- For LLM context, pass a compact event bundle: detections, timestamps, confidence, location, related RFID/audio events, and Foundry object references.

Microphone:

- Run voice activity detection before ASR to reduce load.
- Convert audio to timestamped transcripts or acoustic event labels before handing context to the LLM.
- Keep raw audio local by default; write transcripts, confidence, and redaction status back to Foundry when allowed.
- Non-Chinese ASR candidates: Whisper tiny/base/small via `whisper.cpp` for Pi-class devices, or IBM Granite Speech on stronger Pi 5/local hub hardware after benchmarking.

RFID readers:

- Treat RFID as the most deterministic identity/presence signal.
- Normalize reads into `RfidEvent` records and join them against Foundry asset/person/tag objects.
- Emit `ProviderStyleLocationEvent` records from Arduino RFID reads and local Wi-Fi/proximity context to implement the structure of future provider-style RF/LTE telemetry.
- For the hackathon demo, default this to an L3Harris-style tactical LTE mock envelope with `isSimulated=true`; do not represent it as a live carrier or vendor integration.
- Mark Arduino-derived location as coarse and not carrier-grade; do not present it as carrier-grade location.
- Use RFID to ground camera/audio ambiguity, for example "asset likely present in zone" rather than relying on vision alone.
- Track reader health, duplicate reads, missed-read windows, and tag-reader topology as separate operational signals.

Provider-style location telemetry:

- Normalize all location feeds into `LocationFix` records.
- Required fields: `sourceType`, `sourceId`, `entityId`, `zoneId` or coordinates, `precisionRadiusMeters`, `confidence`, `observedAt`, `expiresAt`, `isCarrierGrade`, supporting evidence IDs, and provider envelope metadata.
- For the Arduino RFID implementation, `sourceType` should be `rfid_provider_style` and `isCarrierGrade` must be false.
- Provider envelope metadata should include `schemaVersion`, `providerName`, `emulationProfile`, `transport`, optional network/cell/sector/access-point fields, `verificationMethod`, and `isSimulated`.
- CASK and the LLM should reason from precision and confidence, not from a false assumption of exact location.

Omni-model fusion:

- Build a typed evidence bundle per tracked subject or asset rather than prompting over raw streams.
- Maintain confidence and freshness separately for RFID, provider-style location, camera, microphone, Foundry context, and mesh health.
- Preserve conflicting evidence instead of overwriting it; the LLM should explain contradictions.
- Broadcast a ping only when deterministic confidence thresholds are crossed or operator policy allows it.
- Keep final routing or deployment recommendations constrained to non-kinetic coordination and verification.
- Counter-UAS outputs must stop at evidence-backed cueing, policy status, and recommended verification checks.

Local LLM control-plane filtering:

- Allowed decisions: `send_now`, `summarize_first`, `hold`, `drop_duplicate`, and `review_policy`.
- Run the filter over compact metadata, transcripts, thumbnails, and policy state before forwarding raw media.
- Enforce schema-constrained JSON; invalid JSON falls back to deterministic Rust rules.

Always-on integration:

- Treat the streaming layer as the hard part: the LLM is useful only because CASK events are continuously normalized, sequenced, replicated, and made available to the elected coordinator.
- Use Gemma for both edge explanation and coordinator organization through the same CASK context pack.
- Keep RAG local and compact: retrieve over approved Drive notes, Foundry object summaries, ontology shape, and recent stream records rather than raw camera/audio streams.
- Kafka is an integration target, not a demo prerequisite. The local stream spine emits Kafka-shaped records that can be forwarded to Kafka/Foundry when a broker or connector is available.
- Use model output as advisory only. The Rust congestion guard owns final send/hold/drop behavior.
- Protect the selected gateway with per-peer rate limits, in-flight transfer caps, queue watermarks, retry jitter, and CPU/memory/network saturation checks.
- Low-priority media must not block urgent evidence, policy cue updates, or acknowledgement receipts.

Required node endpoints for this path:

- `GET /congestion`: queue depth, in-flight transfers, CPU, memory, network usage, and gateway saturation.
- `GET /gossip/world`: shared node/evidence state used by the coordinator.
- `GET /coordinator/latest`: current singleton coordinator directive for the active Raft-style term.
- `POST /bundles/{bundle_id}/decision`: local LLM/rules decision and priority.
- `GET /cues`: active `CounterUasCue` records and policy review state.
- `POST /cues/{cue_id}/ack`: operator acknowledgement from the Pi-hosted UI.

## Interoperability Notes

Keep the MVP self-contained, but align the vocabulary with current Army and defense C2 direction:

- Army Next Generation Command and Control (NGC2): data-centric C2, resilient transport, integrated data, and application layers.
- Anduril EagleEye: target display metaphor for headborne mission command, digital vision, and AI-assisted situational awareness; the MVP Pi-hosted UI should emulate this cueing workflow.
- Anduril Lattice: interoperability research target for entity, task, and object style C2/situational-awareness APIs.
- Lockheed Martin C2/BMC systems: interoperability research target for command-and-control decision support and battle management concepts.
- Army AR / chest display: future operator-interface target; the MVP should remain a Pi-hosted UI that can run on an attached display, kiosk browser, or chest-worn compute/display rig.
- Beyond-line-of-sight communications: stretch transport layer requirement after the local DDIL demo works.
- Maritime or sea-warfare extension: scenario variant using the same sensor bundle, drone observation, cueing, and policy-gate schema.

Potential EagleEye/Lattice adapter boundary:

- Publish `DroneObservation` and `ControlSourceEstimate` as display entities.
- Store thumbnails, clips, transcripts, and evidence bundles as object references when policy allows.
- Publish `CounterUasCue` as a review task or cue item requiring acknowledgement.
- Attach `PolicyGate` state to every cue so the display cannot imply authorization the backend has not granted.
- Keep engagement controls out of the MVP adapter. Display only evidence, confidence, policy state, and verification prompts.

## Pi Hardware Strategy

Pi 4B:

- Treat the two Pi 4 Model B devices as sensor and preprocessing nodes first.
- Run telemetry validation, compression, batching, deterministic filtering, and congestion-aware forwarding.
- Benchmark a small non-Chinese local model such as `HuggingFaceTB/SmolLM2-360M-Instruct` or `meta-llama/Llama-3.2-1B-Instruct` only if thermals and RAM allow.
- Keep deterministic Rust rules as the fallback and final authority.

Pi 5:

- Treat the single Pi 5 as the CASK edge hub candidate.
- Run the local cache, retrieval, insight generation, writeback queue, congestion guard, and Pi-hosted EagleEye-style display shell.
- Prefer quantized models through `llama.cpp` or Ollama-style local APIs.
- If using Raspberry Pi AI HAT+ 2, evaluate the Hailo Ollama server model list and keep only non-Chinese-origin options.

## Shared Drive Context Intake

Use the shared Google Drive as a team drop for data ideas, test fixtures, sensor notes, diagrams, evaluation prompts, and context documents. For anything intended to become LLM context, include:

- Title and owner.
- Source type: live capture, test fixture, sensor note, Foundry idea, architecture note, evaluation prompt, UI idea, or policy constraint.
- Whether the content is real captured data, a test fixture, or speculative planning context.
- Sensitivity and retention expectation.
- Related sensor/event types, if known.
- Short summary of how it should affect the CASK demo.

The future ingestion path should convert cleared Drive content into attributed chunks and embeddings, then expose them to the LLM as cited context alongside Foundry objects and sensor-derived events.

## Non-Chinese Local LLM Shortlist

Primary candidates:

- `ibm-granite/granite-3.3-2b-instruct`: Apache 2.0, 2B parameters, 128K context, RAG and function-calling oriented. Good first Pi 5 candidate.
- `meta-llama/Llama-3.2-1B-Instruct`: practical baseline for Pi 4B/Pi 5, especially in 4-bit GGUF form. Use for concise classification, rewriting, and small summaries.
- `meta-llama/Llama-3.2-3B-Instruct`: better quality than 1B, likely Pi 5 hub only.
- `HuggingFaceTB/SmolLM3-3B`: Apache 2.0, 3B, long context, tool-calling support. Good Pi 5 candidate if quantized performance is acceptable.
- `microsoft/Phi-4-mini-instruct`: 3.8B, 128K context, strong reasoning focus. Evaluate on Pi 5 with enough RAM or on a stronger local hub.

Secondary candidates:

- `google/gemma-3-1b-it` or Gemma 3 270M: best for Pi 4B-class very small local tasks.
- `google/gemma-4-E2B-it`: attractive for multimodal/audio-aware CASK use, but treat as Pi 5-plus or local server class until measured on target hardware.

Embedding/RAG candidates:

- `google/embeddinggemma-300m`: 300M parameter on-device embedding model, strong default for local retrieval if Gemma license terms are acceptable.
- `nomic-ai/nomic-embed-text-v1.5`: Apache 2.0, English-focused, mature local embedding option.
- IBM Granite embedding models: good enterprise-aligned option if we want to keep generation and embedding under the same model family.

Avoid for this project:

- Qwen embeddings/rerankers and Qwen chat models.
- DeepSeek distilled variants, including models distilled into non-Chinese base architectures.
- Any model with unclear provenance, unclear license, or no reproducible local quantization path.

## Evaluation Plan

Use a small acceptance harness before choosing the default runtime:

- 25 to 50 mission-style prompts built from cleared live-capture snapshots or explicit test fixtures.
- Shared Drive context retrieval tests using cleared team-contributed notes and test fixtures.
- Require structured JSON output for every insight.
- Validate every output against a schema.
- Measure latency, RAM, CPU temperature, and tokens/second on both Pi 4 Model B nodes and the Pi 5 separately.
- Score evidence grounding: every claim must cite an observation ID or Foundry object ID.
- Score false escalation and false dismissal separately.
- For counter-UAS prompts, fail any output that recommends target prosecution, engagement, or harming a person.
- Test backpressure behavior: when `gateway_queue=high`, the model/rules should choose `summarize_first`, `hold`, or another low-bandwidth strategy.
- Test fallback behavior: when the model server is stopped, deterministic Rust rules must still produce a forwarding decision.
- Test integration: `POST /bundles/{bundle_id}/decision` must store the decision and make it visible through `GET /observations` or `GET /cues`.
- Run at temperature 0 or near 0 for repeatability.
- Test degraded modes: no Foundry network, stale cache, mesh partition, clock drift, missing sensor values.

Initial recommendation:

1. Start with `granite-3.3-2b-instruct` on Pi 5 as the hub model.
2. Keep `llama-3.2-1b-instruct` as the Pi 4B fallback/baseline.
3. Use `embeddinggemma-300m` or `nomic-embed-text-v1.5` for local retrieval.
4. Benchmark `SmolLM3-3B` and `Phi-4-mini-instruct` as quality upgrades after the first OSDK data loop works.

## Public Source Notes

- Palantir OSDK and Developer Console public docs describe OSDK applications, app scopes, OAuth clients, backend service applications, and static Foundry web hosting:
  - https://www.palantir.com/docs/foundry/ontology-sdk-react-applications/overview
  - https://www.palantir.com/docs/foundry/developer-console/overview
  - https://www.palantir.com/docs/foundry/developer-console/application-scopes
  - https://www.palantir.com/docs/foundry/developer-console/permissions
  - https://www.palantir.com/docs/foundry/developer-console/deploy-custom-application-on-foundry
- Public Raspberry Pi docs describe Pi 5 AI HAT+ 2 LLM support through `hailo-ollama`; CASK-specific details may require in-platform Palantir documentation or support:
  - https://www.raspberrypi.com/documentation/computers/ai.html
- Runtime capability references:
  - https://docs.ollama.com/capabilities/structured-outputs
  - https://docs.ollama.com/capabilities/embeddings
- Sensor and edge AI references:
  - https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html
  - https://www.raspberrypi.com/documentation/computers/camera_software.html
  - https://www.raspberrypi.com/documentation/accessories/ai-camera.html
  - https://github.com/openai/whisper/blob/main/model-card.md
- Model cards and vendor docs:
  - https://huggingface.co/ibm-granite/granite-3.3-2b-instruct
  - https://huggingface.co/ibm-granite/granite-speech-3.3-2b
  - https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct
  - https://huggingface.co/HuggingFaceTB/SmolLM3-3B
  - https://huggingface.co/microsoft/Phi-4-mini-instruct
  - https://ai.google.dev/gemma/docs/get_started
  - https://huggingface.co/google/gemma-4-E2B-it
  - https://huggingface.co/google/embeddinggemma-300m
  - https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
- Army / C2 interoperability references:
  - https://www.army.mil/article-amp/287180/army_announces_next_generation_command_and_control_ngc2_prototype_award
  - https://peoc3n.army.mil/Organizations/PM-Next-Generation-Command-and-Control/
  - https://www.anduril.com/eagleeye
  - https://www.gentexcorp.com/news/gentex-expands-partnership-with-anduril-to-deliver-the-ai-driven-eagleeye-system-for-the-modern-warfighter/
  - https://developer.anduril.com/guides/concepts/overview
  - https://developer.anduril.com/reference/overview/overview
  - https://www.lockheedmartin.com/en-us/products/command-and-control.html

Model details should still be benchmarked on the exact Pi hardware before committing.

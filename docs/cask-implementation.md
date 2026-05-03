# CASK Edge Implementation

This repo now includes a runnable local scaffold for the CASK edge path:

- Typed sensor, cue, node-health, and insight contracts in `src/cask/types.ts`.
- A sample Pi sensor bundle in `src/cask/sampleBundle.ts`.
- A live sensor merge boundary in `src/sensors/liveMerge.ts`.
- A local insight adapter in `src/llm/localInsight.ts`.
- A Foundry OSDK uploader in `src/foundry/uploader.ts`.
- A smoke runner in `src/scripts/smoke.ts`.

The smoke runner defaults to mock Foundry and mock LLM mode for local tests, so it can run without secrets:

```bash
npm install
npm run smoke:mock
```

## Live Sensor Merge Boundary

Camera, microphone, and RFID adapters should emit small JSON events instead of building full CASK bundles themselves. The node can merge live Pi/Nano adapter events through:

```bash
npm run sensor:merge -- --input ./local-sensor-events.json
```

or by posting directly to a running node:

```bash
curl -X POST http://127.0.0.1:8080/sensor-events \
  -H 'content-type: application/json' \
  --data @./local-sensor-events.json
```

Accepted event kinds are `camera_detection`, `audio_window`, `rfid_read`, and `node_health`. RFID reads automatically produce both a `RfidEvent` and a coarse `ProviderStyleLocationEvent`/`LocationFix` with `isCarrierGrade=false`. Drone-class camera detections produce `DroneObservation` records. Camera/RFID correlation produces a policy-gated cue for human review.

`POST /sensor-events` and `POST /bundles` also run the configured local insight client on the receiving node. The response includes the local LLM mode/model, the generated `InsightDraft`, the CASK training tag objective summary, and this node's local instruction view. `GET /insights/latest`, `GET /tag-plan/latest`, and `GET /instructions/latest` return those latest runtime products.

All four compute nodes are modeled as local-LLM capable: the two Pi 4B sensor nodes, the Pi 5 hub/display/gateway, and the Jetson Orin Nano inference node.

## Foundry OSDK Setup

Create a Developer Console backend-service application for the Pi-side daemon. The Palantir OSDK backend-service flow uses a confidential OAuth client, `@osdk/client`, `@osdk/oauth`, the Foundry stack URL, and the Ontology RID.

Required local environment values:

```bash
export FOUNDRY_MODE=osdk
export FOUNDRY_API_URL="https://<your-foundry-stack>.palantirfoundry.com"
export FOUNDRY_ONTOLOGY_RID="ri.ontology.main.ontology.<your-ontology-rid>"
export FOUNDRY_CLIENT_ID="<client-id>"
export FOUNDRY_CLIENT_SECRET="<client-secret>"
export FOUNDRY_OSDK_PACKAGE="<generated-osdk-package-name>"
```

Install the generated OSDK package after configuring a local `.npmrc` from the Developer Console package registry. Keep tokens local, and avoid saving the generated package or private tarball path into Git:

```bash
export FOUNDRY_TOKEN="<developer-console-token>"
npm install --no-save <generated-osdk-package-name>@latest
```

If Atlas provides a downloaded package tarball instead of registry install, use the same no-save pattern, for example `npm install --no-save ~/Downloads/@cask-edge-service_sdk-0.1.0.tgz`.

Then run:

```bash
npm run smoke:foundry
```

Current Atlas status is tracked in [Foundry Atlas Status](foundry-atlas-status.md). The visible hackathon ontology currently supports a narrow live smoke through `[Example] CASK GPS Position`; it does not yet expose the full CASK bundle ontology.

## Expected Foundry Action Contract

Choose the upload profile first:

- `FOUNDRY_UPLOAD_PROFILE=bundle_actions`: full local CASK contract, for when the ontology has matching typed actions.
- `FOUNDRY_UPLOAD_PROFILE=cask_gps_position`: current Atlas-compatible smoke profile that writes only `LocationFix` records to `[Example] CASK GPS Position`.

Until we lock the exact ontology action parameter names in Foundry, the uploader supports two payload styles:

- `json` default: each action receives `{ externalId, sourceNodeId, observedAt, policyState, payloadJson }`.
- `raw`: each action receives the full typed object directly.

The current default action export names are:

| Purpose | Env override | Default generated export |
| --- | --- | --- |
| Sensor events | `FOUNDRY_ACTION_CREATE_SENSOR_OBSERVATION` | `createCaskSensorObservation` |
| Location fixes | `FOUNDRY_ACTION_CREATE_LOCATION_FIX` | `createCaskLocationFix` |
| Counter-UAS cues | `FOUNDRY_ACTION_CREATE_COUNTER_UAS_CUE` | `createCaskCounterUasCue` |
| Insight drafts | `FOUNDRY_ACTION_CREATE_INSIGHT_DRAFT` | `createCaskInsightDraft` |
| Node health | `FOUNDRY_ACTION_UPSERT_NODE_HEALTH` | `upsertCaskNodeHealth` |
| CASK GPS Position smoke | `FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION` | `createExampleCaskGpsPosition` |

If the hackathon ontology already has action names with different API names, set the env overrides instead of changing code.

## Local LLM Setup

The LLM adapter supports:

- `LOCAL_LLM_MODE=mock`: deterministic local explanation for tests and missing-model development only.
- `LOCAL_LLM_MODE=ollama`: sends the compact CASK bundle to an Ollama-compatible `/api/chat` endpoint.

Example:

```bash
export LOCAL_LLM_MODE=ollama
export LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
export LOCAL_LLM_MODEL=gemma3:1b
npm run smoke:mock
```

Project policy blocks Chinese-origin model family names, including Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, and InternLM.

## Safety Boundary

The code intentionally emits evidence-backed, policy-gated cue packages. It does not generate engagement plans, target prosecution, capture instructions, or autonomous action recommendations. Recommended checks are limited to verification, sensor repositioning, coverage, deconfliction, and human review.

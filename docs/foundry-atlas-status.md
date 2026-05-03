# Foundry Atlas Status

Date: 2026-05-03

Using the signed-in Atlas browser, the backend-service application for the Pi-side CASK edge daemon now exists in Developer Console.

Do not commit stack URLs, client IDs, application RIDs, ontology RIDs, registry tokens, client secrets, or service-user access details.

## Application State

- Application name: `cask-edge-service`.
- Organization: `NatSec Hackathon`.
- Location: `Altiair Project`.
- Client type: confidential backend service.
- Service user: created for the backend-service application.
- Client secret: generated once and saved only in local ignored storage under `.secrets/`.
- Ontology SDK: added for `NatSec Hackathon Ontology`.

## Visible Ontology Resources

The ontology currently exposes a narrow example CASK location path:

- Object type: `[Example] CASK GPS Position`.
- Object API name visible in Atlas: `sampleCaskGpsPosition`.
- Relevant action type: `Create [Example] CASK GPS Position`.
- Action API name visible in Atlas: `create-example-cask-gps-position`.
- Generated TypeScript action export: `createExampleCaskGpsPosition`.
- Generated action parameters: `deviceId`, `latitude`, `longitude`, `altitudeM`, `speedKnots`, `courseDeg`, `fixQuality`, `numSatellites`, `timestamp`, and optional `name`.
- The generated object primary key is `positionId`; the create action does not accept it directly, so the uploader sends the local fix id as `name`.

This is enough for a first live OSDK writeback smoke test for RFID-derived provider-style GPS/location fixes. It is not enough to write the full local CASK bundle contract yet.

## Local Runtime Profiles

The repo supports two Foundry upload profiles:

- `FOUNDRY_UPLOAD_PROFILE=bundle_actions`: full typed CASK bundle actions for sensor observations, location fixes, cues, insight drafts, and node health. Use this when matching ontology actions exist.
- `FOUNDRY_UPLOAD_PROFILE=cask_gps_position`: narrow Atlas-compatible live smoke that writes only `LocationFix` records to `[Example] CASK GPS Position`.

For the current Atlas ontology, use:

```bash
FOUNDRY_UPLOAD_PROFILE=cask_gps_position
FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION=createExampleCaskGpsPosition
```

Keep real runtime values in `.env` or shell exports only.

The repo also supports a read-side intelligence profile:

```bash
GET /foundry/intelligence?refresh=true
```

In `FOUNDRY_MODE=osdk`, the node uses `FOUNDRY_INTEL_OBJECT_EXPORTS` to fetch generated OSDK object exports. The current SDK can pull `ExampleCaskGpsPosition`; full mission intelligence pull expands as the CASK ontology resources are added. This is gateway-only and opportunistic: if Foundry is disconnected, the local LLM continues decentralized operation from cached/local CASK records and queues what happened for later commander sync.

## Atlas Steps Completed

- Added `[Example] CASK GPS Position` to the Ontology SDK resource list.
- Added `Create [Example] CASK GPS Position` to the Ontology SDK action list.
- Saved the SDK resource changes for `cask-edge-service`.
- Generated npm SDK version `0.1.0`.
- Generated package name: `@cask-edge-service/sdk`.
- Generated action exports confirmed locally: `createExampleCaskGpsPosition`.
- Installed the generated package locally outside Git from the Atlas package tarball.
- Configured local ignored `.env` values for the Foundry stack URL, ontology RID, backend-service client id, client secret, generated OSDK package, and CASK GPS action export.
- Ran the live OSDK smoke successfully; Foundry accepted `createExampleCaskGpsPosition` and created an `[Example] CASK GPS Position` object.
- Revalidated direct Foundry from local `.env`: `npm run foundry:direct:intel` returned connected OSDK context, and `npm run foundry:direct:smoke` returned an accepted writeback through `createExampleCaskGpsPosition`.

## Remaining Foundry Work

The current live connection is operational for the narrow GPS-position writeback profile. Remaining work is ontology expansion rather than connection setup:

1. Add full CASK object/action types for mission instructions, policy decisions, deployment orders, node leases, mission timeline events, sensor observations, drone observations, control-source estimates, counter-UAS cues, gossip world state, coordinator directives, insight drafts, and node health.
2. Regenerate the OSDK package after those resources are added.
3. Switch `FOUNDRY_UPLOAD_PROFILE` from `cask_gps_position` to `bundle_actions` once matching actions exist.

## Full CASK Ontology Needed Later

To move beyond the narrow GPS smoke, the ontology should gain first-class object/action types for:

- Sensor observation.
- Location fix.
- Drone observation.
- Control source estimate.
- Counter-UAS cue.
- Mission instruction.
- Policy decision.
- Deployment order.
- Node lease.
- Mission timeline event.
- Gossip world state.
- Coordinator directive.
- Insight draft.
- Node health.

The local TypeScript contracts already model those records. The mission deployment layer is represented by `CaskMissionInstruction`, `CaskPolicyDecision`, `CaskDeploymentOrder`, `CaskNodeLease`, and `CaskMissionTimelineEvent`. Until the ontology catches up, the Pi mesh can keep full bundles and deployment orders locally and write only the available GPS-position slice to Foundry.

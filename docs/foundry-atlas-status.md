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
- Visible action parameters: `deviceID`, `latitude`, `longitude`, `altitudeM`, `speedKnots`, `courseDeg`, `fixQuality`, `numSatellites`, and `timestamp`.
- The action shows ten parameters in Atlas; the likely primary-key parameter is represented locally as `positionID`.

This is enough for a first live OSDK writeback smoke test for RFID-derived provider-style GPS/location fixes. It is not enough to write the full local CASK bundle contract yet.

## Local Runtime Profiles

The repo supports two Foundry upload profiles:

- `FOUNDRY_UPLOAD_PROFILE=bundle_actions`: full typed CASK bundle actions for sensor observations, location fixes, cues, insight drafts, and node health. Use this when matching ontology actions exist.
- `FOUNDRY_UPLOAD_PROFILE=cask_gps_position`: narrow Atlas-compatible live smoke that writes only `LocationFix` records to `[Example] CASK GPS Position`.

For the current Atlas ontology, use:

```bash
FOUNDRY_UPLOAD_PROFILE=cask_gps_position
FOUNDRY_ACTION_CREATE_CASK_GPS_POSITION=sampleCaskGpsPosition
```

Keep real runtime values in `.env` or shell exports only.

## Pending Atlas Steps

These steps modify application/resource access and should be done deliberately:

1. Add `[Example] CASK GPS Position` to the Ontology SDK resource list.
2. Add `Create [Example] CASK GPS Position` to the Ontology SDK action list.
3. Save the SDK resource changes.
4. Generate the first SDK version.
5. Share the selected resource/action with the `cask-edge-service` service user.
6. Install the generated NPM package locally using private registry configuration outside Git.
7. Run the live smoke with `FOUNDRY_MODE=osdk` and `FOUNDRY_UPLOAD_PROFILE=cask_gps_position`.

## Full CASK Ontology Needed Later

To move beyond the narrow GPS smoke, the ontology should gain first-class object/action types for:

- Sensor observation.
- Location fix.
- Drone observation.
- Control source estimate.
- Counter-UAS cue.
- Insight draft.
- Node health.

The local TypeScript contracts already model those records. Until the ontology catches up, the Pi mesh can keep full bundles locally and write only the available GPS-position slice to Foundry.

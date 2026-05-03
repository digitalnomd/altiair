# Altiair UI

Pi-friendly Mission Copilot dashboard for the local mesh demo.

Open `index.html` directly for the embedded demo state, or run the optional local server so the dashboard can proxy live node API calls without browser CORS issues:

```bash
node ui/server.mjs --port 4173 --target http://127.0.0.1:8080
```

Then open:

```text
http://127.0.0.1:4173/
```

The UI accepts either:

- `GET /api/dashboard` returning the dashboard state shape used in `data/demo-state.json`.
- The node API `/dashboard` snapshot through the proxy.
- The existing node API endpoints through the proxy: `/health`, `/topology`, `/peers`, `/gateway`, `/mission-continuity`, `/congestion`, `/gossip/world`, `/mission/instructions/latest`, `/mission/deployment/latest`, `/mission/timeline`, `/foundry/intelligence`, `/foundry/sync/latest`, `/coordinator/latest`, `/bundles/pending`, `/ledger`, `/replication/latest`, `/insights/latest`, `/tag-plan/latest`, and `/instructions/latest`.

The intended producer split is:

- `fusion`: local LLM fusion output from camera, microphone, RF/RFID, and confidence/evidence.
- `missionInstruction` and `deploymentOrder`: operator mission text, policy decision, Pi/Jetson node leases, timeline, and startup commands.
- `foundryIntelligence`: opportunistic Foundry context pull for connected gateways and commander sync status.
- `foundrySync`: latest upload/queue acknowledgement for commander visibility.
- `coordinator`: the current Raft-term singleton coordinator directive, next checks, operator action, and per-node intent assignments.
- `gossip`: node reachability, failed nodes, peer roles, mesh links, and replicated ledger hints.

Use `?source=demo` to force fixture data, or `?api=/api` to choose a same-origin API prefix.

The map overlay is geo-projected when mission geometry is present. The UI will use a deployment object from `deploymentOrder`, `missionDeployment`, `deployment`, or a matching Foundry intelligence record, with geometry in `payloadJson`, `payload`, `properties`, or the direct object fields. Accepted mission geometry includes:

- `map.center`, `geo.center`, `center`, or `location` as `{ latitude, longitude }`, `{ lat, lon }`, or GeoJSON `Point`.
- `objectiveArea`, `authorizedZone`, `missionArea`, `area`, `bounds`, or GeoJSON `Polygon` / `Feature`.
- `nodes`, `nodeLeases`, or `leases` as arrays or keyed objects with node ids and coordinates.
- `uasTrack`, `droneTrack`, `trackTrail`, `flightPath`, or GeoJSON `LineString` for the observed UAS path.
- `uasPosition`, `dronePosition`, `latestPosition`, `controlSource`, or `controlSourceEstimate` for the current track/control-source estimate.

The map surface uses a local tile proxy so the browser only loads same-origin imagery. By default the proxy uses OpenStreetMap tiles for the local demo. To point it at a Foundry/Palantir map tile service, keep credentials in environment variables and start the UI with:

```bash
ALTIAIR_MAP_TILE_TEMPLATE="https://<foundry-map-tile-url>/{z}/{x}/{y}.png" \
ALTIAIR_MAP_TILE_TOKEN="<local-token-if-required>" \
node ui/server.mjs --port 4173 --target http://127.0.0.1:8080
```

For a teammate frontend running on a different dev server, prefer the proxy above. If direct browser-to-node calls are needed, start the node API with:

```bash
ALTIAIR_CORS_ORIGIN=http://localhost:5173 npm run node:api -- --node altiair-hub
```

If `ALTIAIR_API_TOKEN` is enabled, the frontend must send `Authorization: Bearer <token>`.

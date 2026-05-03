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
- The existing node API endpoints through the proxy: `/health`, `/topology`, `/peers`, `/gateway`, `/mission-continuity`, `/congestion`, `/bundles/pending`, `/ledger`, `/replication/latest`, `/insights/latest`, `/tag-plan/latest`, and `/instructions/latest`.

The intended producer split is:

- `fusion`: local LLM fusion output from camera, microphone, RF/RFID, and confidence/evidence.
- `coordinator`: next checks, operator action, and per-node intent assignments.
- `gossip`: node reachability, peer roles, mesh links, and replicated ledger hints.

Use `?source=demo` to force fixture data, or `?api=/api` to choose a same-origin API prefix.

For a teammate frontend running on a different dev server, prefer the proxy above. If direct browser-to-node calls are needed, start the node API with:

```bash
ALTIAIR_CORS_ORIGIN=http://localhost:5173 npm run node:api -- --node altiair-hub
```

If `ALTIAIR_API_TOKEN` is enabled, the frontend must send `Authorization: Bearer <token>`.

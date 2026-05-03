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
- The existing node API endpoints through the proxy: `/health`, `/topology`, `/peers`, `/gateway`, `/congestion`, `/bundles/pending`, and `/ledger`.

The intended producer split is:

- `fusion`: local LLM fusion output from camera, microphone, RF/RFID, and confidence/evidence.
- `coordinator`: next checks, operator action, and per-node intent assignments.
- `gossip`: node reachability, peer roles, mesh links, and replicated ledger hints.

Use `?source=demo` to force fixture data, or `?api=/api` to choose a same-origin API prefix.

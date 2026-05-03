"""
dashboard/server.py

Flask server serving the iPad tactical display.
Each soldier opens http://<their_node_ip>:8080 on their iPad.

Shows:
  - Their personal orders (from coordinator LLM)
  - All active nodes and their current situation
  - Which node is currently the Raft coordinator
  - Live auto-refresh every 2 seconds
"""

import logging
from flask import Flask, jsonify, render_template_string

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ HTML template

DASHBOARD_HTML = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Node {{ node_id }} — Tactical</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #050a05;
      color: #00ff88;
      font-family: 'Courier New', monospace;
      padding: 16px;
      font-size: 14px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #00ff8866;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    h1 { font-size: 18px; color: #fff; letter-spacing: 2px; }
    .leader-badge {
      background: #00ff8822;
      border: 1px solid #00ff88;
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 11px;
    }
    .orders-box {
      background: #0f1f0f;
      border: 2px solid #ffff00;
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .orders-label {
      color: #ffff00;
      font-size: 11px;
      letter-spacing: 2px;
      margin-bottom: 6px;
    }
    .orders-text {
      color: #ffffff;
      font-size: 16px;
      line-height: 1.5;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
    }
    .node-card {
      border: 1px solid #00ff8855;
      border-radius: 5px;
      padding: 12px;
      background: #080f08;
    }
    .node-card.threat {
      border-color: #ff4444;
      background: #1a0505;
    }
    .node-card.dead {
      border-color: #444;
      background: #0a0a0a;
      opacity: 0.5;
    }
    .node-id { font-weight: bold; font-size: 13px; margin-bottom: 6px; }
    .node-id .me { color: #ffff00; }
    .summary { color: #cccccc; margin: 4px 0; font-size: 12px; line-height: 1.4; }
    .meta { font-size: 11px; color: #888; margin-top: 6px; }
    .threat-badge {
      display: inline-block;
      background: #ff4444;
      color: #fff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 2px;
      margin-bottom: 4px;
    }
    .ts { font-size: 10px; color: #555; margin-top: 12px; text-align: right; }
  </style>
</head>
<body>
  <header>
    <h1>⬡ {{ node_id|upper }} — TACTICAL</h1>
    <div class="leader-badge" id="leader-info">connecting...</div>
  </header>

  <div class="orders-box">
    <div class="orders-label">▶ YOUR ORDERS</div>
    <div class="orders-text" id="my-orders">Awaiting coordinator...</div>
  </div>

  <div class="grid" id="node-grid"></div>
  <div class="ts" id="ts"></div>

  <script>
    const MY_NODE = "{{ node_id }}";

    async function refresh() {
      try {
        const r = await fetch('/api/state');
        const d = await r.json();

        // Orders
        document.getElementById('my-orders').textContent =
          d.my_instruction || 'Awaiting coordinator...';

        // Leader badge
        document.getElementById('leader-info').textContent =
          d.is_leader ? '★ COORDINATOR (THIS NODE)' : `COORDINATOR: ${d.leader || '?'}`;

        // Node grid
        const allNodes = d.all_states || {};
        const active   = new Set(d.active_nodes || []);
        let html = '';

        for (const [nid, state] of Object.entries(allNodes)) {
          const isMe    = nid === MY_NODE;
          const isDead  = !active.has(nid);
          const hasThreat = state.threat_detected;

          let cardClass = 'node-card';
          if (isDead)    cardClass += ' dead';
          else if (hasThreat) cardClass += ' threat';

          html += `<div class="${cardClass}">
            <div class="node-id">
              ${isMe ? '<span class="me">★ </span>' : ''}${nid}${isDead ? ' [DARK]' : ''}
            </div>
            ${hasThreat ? `<div class="threat-badge">⚠ ${state.threat_type?.toUpperCase()}</div>` : ''}
            <div class="summary">${state.summary || 'No data'}</div>
            <div class="meta">
              Bearing: ${state.estimated_bearing ?? '—'}° |
              Dist: ${state.estimated_distance ?? '—'} |
              Conf: ${state.confidence ?? 0}%
            </div>
          </div>`;
        }

        document.getElementById('node-grid').innerHTML = html || '<div>No nodes reporting</div>';
        document.getElementById('ts').textContent =
          `Last update: ${new Date().toLocaleTimeString()}`;

      } catch(e) {
        console.error('Refresh error:', e);
      }
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>"""


# ------------------------------------------------------------------ Flask app


def create_dashboard(node_id: str, world_state, raft_node=None) -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index():
        return render_template_string(DASHBOARD_HTML, node_id=node_id)

    @app.route("/api/state")
    def state():
        snapshot = world_state.get_full_snapshot()
        snapshot["my_instruction"] = world_state.get_my_instruction()
        snapshot["is_leader"] = raft_node.is_leader() if raft_node else False
        snapshot["leader"] = raft_node.get_leader_address() if raft_node else "unknown"
        return jsonify(snapshot)

    return app

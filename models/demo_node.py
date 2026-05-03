"""
demo_node.py — Run this on each device.

  Device 1 (Node 1):  NODE_ID="node_1" in config.py  →  python demo_node.py
  Device 2 (Node 2):  NODE_ID="node_2" in config.py  →  python demo_node.py

iPad / UI connects to Node 2's API: http://192.168.42.2:8080/state

Demo kill moment:
  Kill Node 1 (Ctrl+C or close terminal).
  Node 2 detects heartbeat timeout after 3 seconds.
  Node 2 sets itself as coordinator, switches to phase_1 scripts.
  /state reflects this immediately — UI updates on next poll.

No LLMs run. No Raft library. Coordinator election = heartbeat timeout.
"""

import time
import json
import threading
import logging

import zmq
from flask import Flask, jsonify
from flask_cors import CORS

import config
import scenario

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)-8s]  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("node")

# ── World State ───────────────────────────────────────────────────────────────

world = {
    "nodes": {},  # node_id → sensor + fused state
    "coordinator": "node_1",  # who is currently coordinator
    "phase": 0,
    "instructions": scenario.COORDINATOR_INSTRUCTIONS["phase_0"],
}
lock = threading.Lock()


def _make_node_entry(node_id: str, phase: int, alive: bool = True) -> dict:
    """Build a node state dict from scenario data."""
    phase_key = f"phase_{phase}"
    ndata = scenario.NODE_STATES.get(node_id, {})
    s = ndata.get(phase_key) or ndata.get("phase_0") or {}
    fused = s.get("fused", {})
    return {
        **fused,
        "visual": s.get("visual", ""),
        "audio": s.get("audio", ""),
        "rf": s.get("rf", ""),
        "last_seen": time.time(),
        "alive": alive,
    }


# Pre-populate simulated nodes 3 and 4
with lock:
    for sim_id in ("node_3", "node_4"):
        world["nodes"][sim_id] = _make_node_entry(sim_id, 0)

# ── Gossip: Broadcaster ───────────────────────────────────────────────────────


def broadcaster():
    """ZMQ PUB — sends our current state to all peers every 500ms."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.PUB)
    sock.bind(f"tcp://*:{config.GOSSIP_PORT}")
    time.sleep(0.5)  # let subscribers connect first

    log.info(f"Broadcaster bound on :{config.GOSSIP_PORT}")

    while True:
        with lock:
            phase = world["phase"]
            is_coord = world["coordinator"] == config.NODE_ID
            instructions = world["instructions"] if is_coord else {}

        entry = _make_node_entry(config.NODE_ID, phase)

        payload = {
            "node_id": config.NODE_ID,
            "timestamp": time.time(),
            "is_coordinator": is_coord,
            "fused": {
                k: entry[k]
                for k in (
                    "threat_detected",
                    "threat_type",
                    "estimated_bearing",
                    "estimated_distance",
                    "confidence",
                    "summary",
                )
                if k in entry
            },
            "sensors": {
                "visual": entry["visual"],
                "audio": entry["audio"],
                "rf": entry["rf"],
            },
            "instructions": instructions,
        }

        sock.send_string(json.dumps(payload))
        time.sleep(0.5)


# ── Gossip: Listener ──────────────────────────────────────────────────────────


def listener():
    """ZMQ SUB — receives state from all peer nodes."""
    ctx = zmq.Context()
    sock = ctx.socket(zmq.SUB)
    sock.setsockopt_string(zmq.SUBSCRIBE, "")
    sock.setsockopt(zmq.RCVTIMEO, 200)

    for nid, ip in config.NODES.items():
        if nid != config.NODE_ID:
            addr = f"tcp://{ip}:{config.GOSSIP_PORT}"
            sock.connect(addr)
            log.info(f"Subscribed to {nid} @ {addr}")

    while True:
        try:
            data = json.loads(sock.recv_string())
            nid = data["node_id"]

            with lock:
                world["nodes"][nid] = {
                    **data["fused"],
                    "visual": data["sensors"]["visual"],
                    "audio": data["sensors"]["audio"],
                    "rf": data["sensors"]["rf"],
                    "last_seen": data["timestamp"],
                    "alive": True,
                }
                # If coordinator is sending instructions, apply them
                if data.get("is_coordinator") and data.get("instructions"):
                    world["instructions"] = data["instructions"]

        except zmq.Again:
            pass  # no message this cycle — fine
        except Exception as e:
            log.error(f"Listener: {e}")


# ── Coordinator Election ──────────────────────────────────────────────────────


def coordinator_loop():
    """
    Heartbeat-based coordinator election.
    Rule: if node_1 hasn't gossiped in NODE_TIMEOUT seconds and I'm node_2,
          I become coordinator and switch to phase_1 scripts.

    No Raft. No library. This is sufficient for a 2-node demo.
    """
    announced = False

    while True:
        time.sleep(0.5)
        now = time.time()

        with lock:
            n1 = world["nodes"].get("node_1")
            n1_alive = n1 is not None and (now - n1["last_seen"]) < config.NODE_TIMEOUT
            currently = world["coordinator"]

        # Update node_1 alive flag
        if n1 is not None:
            with lock:
                world["nodes"]["node_1"]["alive"] = n1_alive

        # Check if we need to elect a new coordinator
        if not n1_alive and currently == "node_1":
            if config.NODE_ID == "node_2" and not announced:
                log.warning("NODE 1 HEARTBEAT LOST — ASSUMING COORDINATION")
                with lock:
                    world["coordinator"] = "node_2"
                    world["phase"] = 1
                    world["instructions"] = scenario.COORDINATOR_INSTRUCTIONS["phase_1"]
                    if "node_1" in world["nodes"]:
                        world["nodes"]["node_1"]["alive"] = False
                announced = True

        # Reset if node_1 comes back (for reset/demo replay)
        if n1_alive and currently == "node_2" and config.NODE_ID == "node_2":
            log.info("NODE 1 SIGNAL RESTORED — returning coordination")
            with lock:
                world["coordinator"] = "node_1"
                world["phase"] = 0
                world["instructions"] = scenario.COORDINATOR_INSTRUCTIONS["phase_0"]
            announced = False


# ── Self State Update ─────────────────────────────────────────────────────────


def self_update_loop():
    """Keep our own node entry in world state current."""
    while True:
        with lock:
            phase = world["phase"]

        entry = _make_node_entry(config.NODE_ID, phase)

        with lock:
            world["nodes"][config.NODE_ID] = entry

        time.sleep(1.0)


# ── Flask API ─────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)  # allow iPad / any origin to poll


@app.route("/state")
def get_state():
    with lock:
        snapshot = {
            "my_node": config.NODE_ID,
            "coordinator": world["coordinator"],
            "phase": world["phase"],
            "instructions": world["instructions"],
            "my_instruction": world["instructions"].get(config.NODE_ID),
            "nodes": {nid: {**data} for nid, data in world["nodes"].items()},
            "timestamp": time.time(),
        }
    return jsonify(snapshot)


@app.route("/health")
def health():
    return jsonify({"node": config.NODE_ID, "status": "alive", "t": time.time()})


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"=== MESH NODE: {config.NODE_ID} @ {config.MY_IP} ===")
    log.info(f"API:  http://{config.MY_IP}:{config.API_PORT}/state")
    log.info(f"Kill Node 1 to trigger coordinator handoff demo")

    for fn in (broadcaster, listener, coordinator_loop, self_update_loop):
        threading.Thread(target=fn, daemon=True).start()

    app.run(host="0.0.0.0", port=config.API_PORT, debug=False, use_reloader=False)

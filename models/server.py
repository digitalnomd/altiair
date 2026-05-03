"""
Dashboard/API server.

Serves the UI files from ../ui and exposes /api/dashboard in the same contract
used by ui/data/demo-state.json. The UI can also be served separately and point
at this process through its Node proxy.
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any

try:
    import config
except ImportError:  # pragma: no cover
    from . import config  # type: ignore

logger = logging.getLogger(__name__)

UI_DIR = Path(__file__).resolve().parents[1] / "ui"

NODE_POINTS = {
    "node_1": {"id": "N1", "label": "Node 1", "x": 49.6, "y": 48.8, "labelOffset": {"x": -18, "y": 30}},
    "node_2": {
        "id": "N2",
        "label": "Node 2",
        "x": 71.7,
        "y": 66.3,
        "labelOffset": {"x": 20, "y": 0},
        "fov": [{"x": 72.2, "y": 67.2}, {"x": 78.5, "y": 74.0}, {"x": 73.8, "y": 87.0}],
    },
    "node_3": {
        "id": "N3",
        "label": "Node 3",
        "x": 33.1,
        "y": 74.6,
        "labelOffset": {"x": -65, "y": 8},
        "fov": [{"x": 32.9, "y": 75.4}, {"x": 28.8, "y": 86.8}, {"x": 33.4, "y": 93.4}],
    },
    "node_4": {
        "id": "N4",
        "label": "Node 4",
        "x": 28.0,
        "y": 20.5,
        "labelOffset": {"x": -56, "y": -4},
        "fov": [{"x": 28.6, "y": 21.3}, {"x": 33.2, "y": 29.5}, {"x": 30.0, "y": 37.2}],
    },
}

OBJECTIVE_AREA = [
    {"x": 45.4, "y": 73.7},
    {"x": 43.2, "y": 70.0},
    {"x": 42.9, "y": 64.2},
    {"x": 44.3, "y": 58.4},
    {"x": 47.2, "y": 54.6},
    {"x": 49.0, "y": 51.0},
    {"x": 52.2, "y": 53.0},
    {"x": 54.4, "y": 52.2},
    {"x": 55.4, "y": 56.4},
    {"x": 57.4, "y": 58.0},
    {"x": 57.0, "y": 63.4},
    {"x": 55.1, "y": 66.8},
    {"x": 55.0, "y": 72.0},
    {"x": 52.6, "y": 78.4},
    {"x": 49.7, "y": 82.0},
    {"x": 46.6, "y": 81.0},
    {"x": 44.4, "y": 78.0},
]


def create_dashboard(
    node_id: str,
    world_state,
    raft_node=None,
    mission_name: str | None = None,
    mission_objective: str | None = None,
) -> Any:
    from flask import Flask, jsonify, send_from_directory

    app = Flask(__name__, static_folder=str(UI_DIR), static_url_path="")
    mission_name = mission_name or config.MISSION_NAME
    mission_objective = mission_objective or config.MISSION_OBJECTIVE

    @app.after_request
    def add_headers(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "content-type, authorization"
        return response

    @app.route("/")
    def index():
        if UI_DIR.exists():
            return send_from_directory(UI_DIR, "index.html")
        return jsonify({"message": "UI directory not found", "api": "/api/dashboard"})

    @app.route("/<path:asset_path>")
    def static_asset(asset_path: str):
        if UI_DIR.exists() and (UI_DIR / asset_path).is_file():
            return send_from_directory(UI_DIR, asset_path)
        return jsonify({"error": "Not found"}), 404

    @app.route("/api/state")
    def state():
        snapshot = world_state.get_full_snapshot()
        snapshot["my_instruction"] = world_state.get_my_instruction()
        snapshot["is_leader"] = raft_node.is_leader() if raft_node else False
        snapshot["leader"] = raft_node.get_leader_address() if raft_node else "unknown"
        return jsonify(snapshot)

    @app.route("/api/dashboard")
    @app.route("/dashboard")
    def dashboard():
        return jsonify(
            build_dashboard_state(
                node_id=node_id,
                world_state=world_state,
                raft_node=raft_node,
                mission_name=mission_name,
                mission_objective=mission_objective,
            )
        )

    @app.route("/health")
    def health():
        snapshot = world_state.get_full_snapshot()
        return jsonify(
            {
                "nodeId": node_id,
                "nodeRole": "coordinator_leader" if raft_node and raft_node.is_leader() else "edge_node",
                "observedAt": iso_now(),
                "peerCount": max(0, len(snapshot["active_nodes"]) - 1),
                "queueDepth": 0,
                "networkReachable": True,
                "foundryReachable": False,
                "modelStatus": "ready",
            }
        )

    @app.route("/topology")
    def topology():
        return jsonify(
            {
                "missionNetworkId": "altiair-python-mesh",
                "nodes": [
                    {
                        "id": nid,
                        "hostname": nid,
                        "platform": "edge_node",
                        "roles": ["edge_sensor", "coordinator_candidate"],
                        "lanAddress": ip,
                    }
                    for nid, ip in config.NODES.items()
                ],
            }
        )

    @app.route("/peers")
    def peers():
        snapshot = world_state.get_full_snapshot()
        active = set(snapshot["active_nodes"])
        return jsonify(
            {
                "nodeId": node_id,
                "peers": [
                    {
                        "id": nid,
                        "observation": {
                            "online": nid in active,
                            "queueDepth": 0,
                            "cpuLoad": 0,
                            "foundryReachable": False,
                            "networkReachable": nid in active,
                        },
                    }
                    for nid in config.NODES
                    if nid != node_id
                ],
            }
        )

    @app.route("/gateway")
    def gateway():
        leader_id = raft_node.get_leader_id() if raft_node and hasattr(raft_node, "get_leader_id") else None
        return jsonify(
            {
                "selectedGatewayId": leader_id,
                "selectedGatewayScore": 100 if leader_id else 0,
                "retainedCurrentGateway": True,
                "localOnly": True,
                "decisionReason": "Coordinator leader is the current local UI/gossip authority.",
                "scores": [{"nodeId": nid, "eligible": True, "score": 100 if nid == leader_id else 50} for nid in config.NODES],
            }
        )

    @app.route("/congestion")
    def congestion():
        return jsonify(
            {
                "congestion": {
                    "acceptBundle": True,
                    "preferredDecision": "summarize_first",
                    "retryAfterSeconds": None,
                    "reasons": ["Python prototype uses compact fused state gossip only."],
                }
            }
        )

    @app.route("/bundles/pending")
    def bundles_pending():
        return jsonify({"nodeId": node_id, "count": 0, "bundles": []})

    @app.route("/ledger")
    def ledger():
        snapshot = world_state.get_full_snapshot()
        return jsonify(
            {
                "nodeId": node_id,
                "bundleCount": len(snapshot["all_states"]),
                "storedRecordCount": len(snapshot["all_states"]),
                "survivableNodeLoss": len(snapshot["active_nodes"]) >= 3,
                "records": [],
            }
        )

    return app


def build_dashboard_state(
    node_id: str,
    world_state,
    raft_node,
    mission_name: str,
    mission_objective: str,
) -> dict[str, Any]:
    snapshot = world_state.get_full_snapshot()
    all_states = snapshot["all_states"]
    active_nodes = set(snapshot["active_nodes"])
    known_nodes = sorted(set(config.NODES) | set(all_states))
    coordinator = snapshot.get("coordinator") or {}
    leader_id = (
        raft_node.get_leader_id()
        if raft_node is not None and hasattr(raft_node, "get_leader_id")
        else snapshot.get("leader_id")
    )

    primary_node, primary_state = primary_fused_state(all_states)
    confidence = int(primary_state.get("confidence", 0) or 0)
    threat_type = primary_state.get("threat_type", "none")
    bearing = primary_state.get("estimated_bearing")
    latest_event = (
        f"RFID tag present at {display_node(primary_node)}"
        if primary_state.get("threat_detected") and threat_type == "rfid_tag"
        else
        f"Possible {threat_type} at bearing {format_bearing(bearing)}"
        if primary_state.get("threat_detected")
        else "No active fused event"
    )

    instructions = snapshot.get("instructions") or coordinator.get("instructions") or {}
    policy_gate = coordinator.get("policy_gate") or "review_needed"
    recommended = coordinator.get("recommended_next_action") or fallback_recommendation(primary_node, primary_state)
    operator_action = (
        coordinator.get("operator_next_action")
        or instructions.get(node_id)
        or "Maintain observation and keep collecting local evidence."
    )

    return {
        "updatedAt": iso_now(),
        "mission": {
            "name": mission_name,
            "status": f"{len(active_nodes)}/{len(known_nodes)} nodes active - {mesh_status(active_nodes)}",
        },
        "fusion": {
            "confidenceLabel": confidence_label(confidence),
            "confidenceScore": confidence / 100,
            "latestEvent": latest_event,
            "eventLabel": "Fused Detection",
            "position": detection_position(primary_node, primary_state),
            "trackTrail": track_trail(primary_node, primary_state),
            "rfBearings": rf_bearings(primary_state),
            "evidence": evidence_metrics(snapshot, primary_node, primary_state),
            "feed": fusion_feed(snapshot, primary_node, primary_state),
            "policyGate": policy_gate,
        },
        "coordinator": {
            "recommendedNextAction": recommended,
            "operatorNextAction": operator_action,
            "feed": coordinator_feed(coordinator, leader_id, mission_objective),
            "teamPulse": team_pulse(known_nodes, active_nodes, instructions),
        },
        "gossip": {
            "feed": gossip_feed(active_nodes, known_nodes, leader_id),
            "nodes": map_nodes(known_nodes, active_nodes),
            "links": mesh_links(known_nodes),
        },
        "map": {
            "objectiveAreaLabel": "Objective Area",
            "objectiveArea": OBJECTIVE_AREA,
        },
    }


def primary_fused_state(all_states: dict[str, dict[str, Any]]) -> tuple[str | None, dict[str, Any]]:
    if not all_states:
        return None, {}
    return max(
        all_states.items(),
        key=lambda item: (bool(item[1].get("threat_detected")), int(item[1].get("confidence", 0) or 0)),
    )


def evidence_metrics(snapshot: dict[str, Any], primary_node: str | None, primary_state: dict[str, Any]) -> list[dict[str, Any]]:
    sensor_inputs = snapshot.get("sensor_inputs", {}).get(primary_node or "", {})
    visual = sensor_score(sensor_inputs.get("visual", ""), default=int(primary_state.get("confidence", 0) or 0))
    audio = sensor_score(sensor_inputs.get("audio", ""), default=45 if "drone" in str(sensor_inputs.get("audio", "")).lower() else 20)
    rf = sensor_score(sensor_inputs.get("rf", ""), default=70 if "signal" in str(sensor_inputs.get("rf", "")).lower() else 25)
    agreement = sum(score >= 45 for score in [visual, audio, rf])
    return [
        {"id": "visual", "label": "Visual", "kind": "visual", "value": visual, "summary": sensor_inputs.get("visual", "No visual input")},
        {"id": "rf", "label": "RFID", "kind": "rf", "value": rf, "summary": sensor_inputs.get("rf", "No RFID input")},
        {"id": "audio", "label": "Audio", "kind": "audio", "value": audio, "summary": sensor_inputs.get("audio", "No audio input")},
        {
            "id": "agreement",
            "label": f"{agreement}-node agreement" if agreement else "Awaiting agreement",
            "kind": "agreement",
            "value": min(100, agreement * 34),
            "summary": "Agreement count across visual, RF, and audio signals.",
        },
    ]


def fusion_feed(snapshot: dict[str, Any], primary_node: str | None, primary_state: dict[str, Any]) -> list[dict[str, str]]:
    sensor_inputs = snapshot.get("sensor_inputs", {}).get(primary_node or "", {})
    return [
        {"level": "warn" if primary_state.get("threat_detected") else "info", "title": "Fusion", "text": primary_state.get("summary", "Awaiting fused state.")},
        {"level": "info", "title": "Visual", "text": sensor_inputs.get("visual", "No visual input yet.")},
        {"level": "info", "title": "RFID/Audio", "text": f"{sensor_inputs.get('rf', 'No RFID input yet.')} | {sensor_inputs.get('audio', 'No audio input yet.')}"},
    ]


def coordinator_feed(coordinator: dict[str, Any], leader_id: str | None, mission_objective: str) -> list[dict[str, str]]:
    rationale = coordinator.get("rationale")
    rationale_text = str(rationale[0]) if isinstance(rationale, list) and rationale else mission_objective
    return [
        {"level": "good" if leader_id else "warn", "title": "Coordinator", "text": f"Leader: {display_node(leader_id) if leader_id else 'electing'}"},
        {"level": "info", "title": "Intent", "text": coordinator.get("recommended_next_action", "Awaiting coordinator cycle.")},
        {"level": "warn", "title": "Policy", "text": rationale_text},
    ]


def gossip_feed(active_nodes: set[str], known_nodes: list[str], leader_id: str | None) -> list[dict[str, str]]:
    return [
        {"level": "good" if len(active_nodes) >= 3 else "warn", "title": "Mesh", "text": f"{len(active_nodes)} of {len(known_nodes)} nodes reachable through gossip."},
        {"level": "good" if leader_id else "warn", "title": "Leader", "text": display_node(leader_id) if leader_id else "No coordinator leader yet."},
        {"level": "info", "title": "Replication", "text": "Latest fused state and coordinator output are present in gossip payloads."},
    ]


def team_pulse(known_nodes: list[str], active_nodes: set[str], instructions: dict[str, str]) -> list[dict[str, str]]:
    rows = []
    for node_id in known_nodes:
        instruction = instructions.get(node_id, "")
        rows.append(
            {
                "nodeId": short_node(node_id),
                "task": summarize_instruction(instruction) if node_id in active_nodes else "Dark",
                "status": "good" if node_id in active_nodes and instruction else "warn" if node_id not in active_nodes else "neutral",
            }
        )
    return rows


def map_nodes(known_nodes: list[str], active_nodes: set[str]) -> list[dict[str, Any]]:
    rows = []
    for index, node_id in enumerate(known_nodes):
        base = dict(NODE_POINTS.get(node_id, generated_point(node_id, index)))
        active = node_id in active_nodes
        base["status"] = "active" if active else "degraded"
        if not active:
            base["stateLabel"] = "Dark"
        rows.append(base)
    return rows


def mesh_links(known_nodes: list[str]) -> list[list[str]]:
    short_ids = [short_node(node_id) for node_id in known_nodes]
    if len(short_ids) < 2:
        return []
    hub = "N1" if "N1" in short_ids else short_ids[0]
    return [[hub, node_id] for node_id in short_ids if node_id != hub]


def sensor_score(text: str, default: int) -> int:
    text = str(text)
    lowered = text.lower()
    if any(token in lowered for token in ("no tag", "no rfid", "no signal", "background noise", "unavailable", "error", "failed")):
        return 0
    if "rfid(real)" in lowered and ("tag read" in lowered or "tag_id=" in lowered):
        return 98
    if "rfid(simulated)" in lowered and ("tag read" in lowered or "tag_id=" in lowered):
        return 82

    match = re.search(r"conf=([01](?:\.\d+)?)", text)
    if match:
        return clamp(round(float(match.group(1)) * 100), 0, 100)
    match = re.search(r"rssi\s*(-?\d+(?:\.\d+)?)", text.lower())
    if match:
        rssi = float(match.group(1))
        return clamp(round(100 - max(0, min(60, abs(rssi + 35)))), 0, 100)
    return clamp(default, 0, 100)


def detection_position(primary_node: str | None, primary_state: dict[str, Any]) -> dict[str, float]:
    if primary_state.get("threat_detected"):
        bearing = primary_state.get("estimated_bearing")
        if isinstance(bearing, int):
            return {"x": 39.0 + ((bearing - 47) * 0.08), "y": 15.0}
    return {"x": 39.3, "y": 15.2}


def track_trail(primary_node: str | None, primary_state: dict[str, Any]) -> list[dict[str, float]]:
    start = detection_position(primary_node, primary_state)
    return [
        start,
        {"x": start["x"] + 3.0, "y": start["y"] + 5.0},
        {"x": start["x"] + 8.2, "y": start["y"] + 9.2},
        {"x": start["x"] + 16.0, "y": start["y"] + 13.0},
        {"x": start["x"] + 27.0, "y": start["y"] + 18.5},
    ]


def rf_bearings(primary_state: dict[str, Any]) -> list[list[dict[str, float]]]:
    return [[{"x": 39.8, "y": 16.6}, {"x": 49.8, "y": 40.5}, {"x": 72.2, "y": 65.8}]]


def fallback_recommendation(primary_node: str | None, primary_state: dict[str, Any]) -> str:
    if primary_state.get("threat_detected"):
        return f"{display_node(primary_node)} maintain observation and request second-sensor verification"
    return "Continue sensing until independent signals agree"


def mesh_status(active_nodes: set[str]) -> str:
    if len(active_nodes) >= 3:
        return "mesh stable"
    if active_nodes:
        return "mesh degraded"
    return "waiting for gossip"


def confidence_label(confidence: int) -> str:
    if confidence >= 80:
        return "High"
    if confidence >= 45:
        return "Medium"
    return "Low"


def generated_point(node_id: str, index: int) -> dict[str, Any]:
    return {
        "id": short_node(node_id),
        "label": display_node(node_id),
        "x": 22 + ((index * 17) % 58),
        "y": 22 + ((index * 23) % 58),
        "labelOffset": {"x": 18, "y": 0},
    }


def summarize_instruction(instruction: str) -> str:
    if not instruction:
        return "Awaiting task"
    first = instruction.split(".", 1)[0]
    return first[:28]


def short_node(node_id: str | None) -> str:
    if not node_id:
        return "N?"
    match = re.search(r"(\d+)$", node_id)
    return f"N{match.group(1)}" if match else node_id


def display_node(node_id: str | None) -> str:
    if not node_id:
        return "Unknown"
    match = re.search(r"(\d+)$", node_id)
    return f"Node {match.group(1)}" if match else node_id


def format_bearing(value: Any) -> str:
    try:
        return f"{int(value):03d}"
    except (TypeError, ValueError):
        return "unknown"


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))

"""
Thread-safe shared world state.

This is the in-memory bridge between:
- local sensor fusion,
- incoming gossip from peer nodes,
- elected coordinator instructions,
- the UI dashboard API.
"""

from __future__ import annotations

import threading
import time
from typing import Any

try:
    import config
except ImportError:  # pragma: no cover
    from . import config  # type: ignore


class WorldState:
    def __init__(self, node_id: str):
        self._node_id = node_id
        self._lock = threading.RLock()
        self._states: dict[str, dict[str, Any]] = {}
        self._sensor_inputs: dict[str, dict[str, str]] = {}
        self._last_seen: dict[str, float] = {}
        self._instructions: dict[str, str] = {}
        self._coordinator_output: dict[str, Any] = {}
        self._leader_id: str | None = None

    def update_node_state(self, node_id: str, state: dict[str, Any]) -> None:
        """Store a node's latest fused state."""
        now = time.time()
        fused = dict(state or {})
        sensor_inputs = fused.pop("sensor_inputs", None)

        with self._lock:
            self._states[node_id] = fused
            if isinstance(sensor_inputs, dict):
                self._sensor_inputs[node_id] = {
                    "visual": str(sensor_inputs.get("visual", "")),
                    "audio": str(sensor_inputs.get("audio", "")),
                    "rf": str(sensor_inputs.get("rf", "")),
                }
            self._last_seen[node_id] = now

    def ingest_gossip(self, sender: str, payload: dict[str, Any]) -> None:
        """Ingest either a v1 gossip envelope or the older plain fused dict."""
        if not isinstance(payload, dict):
            return

        if "fused" in payload:
            fused = payload.get("fused") or {}
            if isinstance(fused, dict):
                self.update_node_state(sender, fused)

            sensor_inputs = payload.get("sensor_inputs")
            if isinstance(sensor_inputs, dict):
                with self._lock:
                    self._sensor_inputs[sender] = {
                        "visual": str(sensor_inputs.get("visual", "")),
                        "audio": str(sensor_inputs.get("audio", "")),
                        "rf": str(sensor_inputs.get("rf", "")),
                    }
                    self._last_seen[sender] = time.time()

            leader_id = payload.get("leader_id")
            if isinstance(leader_id, str) and leader_id:
                self.set_leader(leader_id)

            instructions = payload.get("instructions")
            if isinstance(instructions, dict):
                self.update_instructions({str(k): str(v) for k, v in instructions.items()})

            coordinator = payload.get("coordinator")
            if isinstance(coordinator, dict):
                self.update_coordinator_output(coordinator)
            return

        self.update_node_state(sender, payload)

    def update_instructions(self, instructions: dict[str, str]) -> None:
        with self._lock:
            self._instructions = dict(instructions or {})

    def update_coordinator_output(self, output: dict[str, Any]) -> None:
        with self._lock:
            self._coordinator_output = dict(output or {})
            instructions = output.get("instructions")
            if isinstance(instructions, dict):
                self._instructions = {str(k): str(v) for k, v in instructions.items()}

    def set_leader(self, leader_id: str | None) -> None:
        with self._lock:
            self._leader_id = leader_id

    def get_my_instruction(self) -> str | None:
        with self._lock:
            return self._instructions.get(self._node_id)

    def get_all_states(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {node_id: dict(state) for node_id, state in self._states.items()}

    def get_sensor_inputs(self) -> dict[str, dict[str, str]]:
        with self._lock:
            return {node_id: dict(values) for node_id, values in self._sensor_inputs.items()}

    def get_instructions(self) -> dict[str, str]:
        with self._lock:
            return dict(self._instructions)

    def get_coordinator_output(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._coordinator_output)

    def get_leader(self) -> str | None:
        with self._lock:
            return self._leader_id

    def get_active_nodes(self, timeout: float | None = None) -> list[str]:
        if timeout is None:
            timeout = config.NODE_TIMEOUT
        now = time.time()
        with self._lock:
            return sorted(node_id for node_id, seen in self._last_seen.items() if now - seen < timeout)

    def get_full_snapshot(self) -> dict[str, Any]:
        with self._lock:
            active_nodes = self.get_active_nodes()
            return {
                "node_id": self._node_id,
                "all_states": {node_id: dict(state) for node_id, state in self._states.items()},
                "sensor_inputs": {node_id: dict(values) for node_id, values in self._sensor_inputs.items()},
                "instructions": dict(self._instructions),
                "coordinator": dict(self._coordinator_output),
                "active_nodes": active_nodes,
                "known_nodes": sorted(set(config.NODES) | set(self._states)),
                "leader_id": self._leader_id,
                "timestamp": time.time(),
            }

    def build_gossip_payload(self, leader_id: str | None, is_leader: bool) -> dict[str, Any]:
        with self._lock:
            fused = dict(self._states.get(self._node_id, {}))
            sensor_inputs = dict(self._sensor_inputs.get(self._node_id, {}))
            return {
                "type": "altiair.gossip.v1",
                "node_id": self._node_id,
                "fused": fused,
                "sensor_inputs": sensor_inputs,
                "instructions": dict(self._instructions),
                "coordinator": dict(self._coordinator_output),
                "leader_id": leader_id,
                "is_leader": is_leader,
                "timestamp": time.time(),
            }

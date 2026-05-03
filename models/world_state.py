"""
state/world_state.py

Thread-safe in-memory store for:
  - Our own fused sensor output
  - Every other node's fused sensor output (received via gossip)
  - Per-node instructions (received from coordinator LLM via Raft)

This is the "shared brain" that the coordinator LLM reads from
and the dashboard reads from.
"""

import time
import threading
from typing import Dict, Optional


class WorldState:
    def __init__(self, node_id: str):
        self._node_id = node_id
        self._lock = threading.Lock()
        self._states: Dict[str, dict] = {}  # node_id → latest fused JSON
        self._last_seen: Dict[str, float] = {}  # node_id → timestamp
        self._instructions: Dict[str, str] = {}  # node_id → tactical instruction

    # ------------------------------------------------------------------ writes

    def update_node_state(self, node_id: str, state: dict) -> None:
        """Call this when we receive a gossip packet from any node
        (including ourselves after local fusion)."""
        with self._lock:
            self._states[node_id] = state
            self._last_seen[node_id] = time.time()

    def update_instructions(self, instructions: Dict[str, str]) -> None:
        """Called by coordinator LLM (on leader) or Raft follower sync."""
        with self._lock:
            self._instructions = instructions

    # ------------------------------------------------------------------ reads

    def get_my_instruction(self) -> Optional[str]:
        with self._lock:
            return self._instructions.get(self._node_id)

    def get_all_states(self) -> Dict[str, dict]:
        with self._lock:
            return dict(self._states)

    def get_active_nodes(self, timeout: float = None) -> list:
        """Returns node IDs that have sent a state within `timeout` seconds.
        Defaults to the NODE_TIMEOUT from config."""
        if timeout is None:
            from config import NODE_TIMEOUT

            timeout = NODE_TIMEOUT
        now = time.time()
        with self._lock:
            return [nid for nid, t in self._last_seen.items() if now - t < timeout]

    def get_full_snapshot(self) -> dict:
        """Used by the dashboard API."""
        with self._lock:
            return {
                "node_id": self._node_id,
                "all_states": dict(self._states),
                "instructions": dict(self._instructions),
                "active_nodes": self.get_active_nodes(),
                "timestamp": time.time(),
            }

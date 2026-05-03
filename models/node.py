"""
Coordinator leader election.

When pysyncobj is installed this uses real Raft for leader election and
instruction replication. When it is not installed, a deterministic lease
fallback elects the lowest active node id from gossip so the prototype still
runs end-to-end on laptops and Pis.
"""

from __future__ import annotations

import logging
import re
from typing import Any

try:
    import config
except ImportError:  # pragma: no cover
    from . import config  # type: ignore

logger = logging.getLogger(__name__)

try:
    from pysyncobj import SyncObj, SyncObjConf, replicated
    from pysyncobj.batteries import ReplDict

    HAVE_SYNC_OBJ = True
except Exception:  # pragma: no cover - exercised when dependency missing
    SyncObj = object  # type: ignore
    SyncObjConf = None  # type: ignore
    ReplDict = None  # type: ignore
    HAVE_SYNC_OBJ = False

    def replicated(fn):  # type: ignore
        return fn


if HAVE_SYNC_OBJ:

    class MeshRaftNode(SyncObj):  # type: ignore[misc]
        def __init__(
            self,
            self_address: str,
            partner_addresses: list[str],
            node_id: str | None = None,
            world_state: Any | None = None,
        ):
            cfg = SyncObjConf(
                autoTick=True,
                heartbeatPeriod=0.3,
                minElectionTimeout=0.6,
                maxElectionTimeout=1.2,
                connectionRetryTime=2.0,
                fullDump=False,
            )
            super().__init__(self_address, partner_addresses, cfg)
            self._shared = ReplDict(self)
            self._self_address = self_address
            self._node_id = node_id or address_to_node_id(self_address)
            self._world_state = world_state
            self._fallback_instructions: dict[str, str] = {}

            logger.info("[Raft] Node started at %s", self_address)
            logger.info("[Raft] Partners: %s", partner_addresses)

        def is_leader(self) -> bool:
            return self.isNodeLeader()

        def get_leader_address(self) -> str:
            leader = self.getLeader()
            return str(leader) if leader else self.get_leader_id() or "no leader elected yet"

        def get_leader_id(self) -> str | None:
            leader = self.getLeader()
            if leader:
                return address_to_node_id(str(leader))
            return None

        @replicated
        def set_instructions(self, instructions: dict[str, str]) -> None:
            self._shared["instructions"] = dict(instructions or {})
            self._fallback_instructions = dict(instructions or {})

        def get_instructions(self) -> dict[str, str]:
            instructions = self._shared.get("instructions", {})
            return dict(instructions or self._fallback_instructions)

else:

    class MeshRaftNode:
        def __init__(
            self,
            self_address: str,
            partner_addresses: list[str],
            node_id: str | None = None,
            world_state: Any | None = None,
        ):
            self._self_address = self_address
            self._partner_addresses = partner_addresses
            self._node_id = node_id or address_to_node_id(self_address)
            self._world_state = world_state
            self._instructions: dict[str, str] = {}
            logger.warning(
                "[Raft] pysyncobj not installed; using gossip lease fallback for leader election"
            )

        def is_leader(self) -> bool:
            return self.get_leader_id() == self._node_id

        def get_leader_address(self) -> str:
            leader_id = self.get_leader_id()
            if not leader_id:
                return "no leader elected yet"
            return f"{leader_id} ({config.NODES.get(leader_id, 'unknown')})"

        def get_leader_id(self) -> str | None:
            candidates = self._candidate_node_ids()
            return sorted(candidates, key=node_sort_key)[0] if candidates else self._node_id

        def set_instructions(self, instructions: dict[str, str]) -> None:
            self._instructions = dict(instructions or {})

        def get_instructions(self) -> dict[str, str]:
            return dict(self._instructions)

        def _candidate_node_ids(self) -> set[str]:
            candidates = {self._node_id}
            if self._world_state is not None:
                candidates.update(self._world_state.get_active_nodes())
            return {node_id for node_id in candidates if node_id in config.NODES}


def address_to_node_id(address: str) -> str:
    host = address.split(":", 1)[0]
    for node_id, ip_address in config.NODES.items():
        if host == ip_address or host == node_id:
            return node_id
    return host


def node_sort_key(node_id: str) -> tuple[int, str]:
    match = re.search(r"(\d+)$", node_id)
    return (int(match.group(1)) if match else 999, node_id)

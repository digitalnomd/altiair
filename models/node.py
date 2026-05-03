"""
raft/node.py

Raft consensus via PySyncObj.
We are NOT using Raft for data replication — gossip handles that.
We use Raft for ONE thing only: electing a single coordinator at a time.

isNodeLeader() → True means: "I should run the coordinator LLM right now."
When I die, Raft re-elects another node as leader in <1 second.
That node already has full world state from gossip, so it picks up instantly.

The replicated `set_instructions` method pushes coordinator output
to all nodes via the Raft log — so everyone gets the instructions
even if they missed the gossip broadcast.
"""

import logging
from pysyncobj import SyncObj, SyncObjConf
from pysyncobj.batteries import ReplDict

logger = logging.getLogger(__name__)


class MeshRaftNode(SyncObj):
    def __init__(self, self_address: str, partner_addresses: list):
        cfg = SyncObjConf(
            autoTick=True,
            # How often leader sends heartbeat to followers
            heartbeatPeriod=0.3,
            # If follower misses heartbeat, it calls election after this window
            minElectionTimeout=0.6,
            maxElectionTimeout=1.2,
            # Retry connecting to partners
            connectionRetryTime=2.0,
            # Suppress internal logging spam
            fullDump=False,
        )
        super().__init__(self_address, partner_addresses, cfg)

        # Shared replicated dict — coordinator output lands here
        # All followers auto-sync it via Raft log
        self._shared = ReplDict(self)

        logger.info(f"[Raft] Node started at {self_address}")
        logger.info(f"[Raft] Partners: {partner_addresses}")

    # ---------------------------------------------------------------- leader

    def is_leader(self) -> bool:
        return self.isNodeLeader()

    def get_leader_address(self) -> str:
        leader = self.getLeader()
        return str(leader) if leader else "no leader elected yet"

    # ---------------------------------------------------------------- shared state

    # @replicated means: when ANY node calls this, it goes through the
    # Raft log and is applied on ALL nodes. This is how coordinator output
    # propagates to every node even without direct broadcast.
    from pysyncobj import replicated

    @replicated
    def set_instructions(self, instructions: dict) -> None:
        """Called by the leader after coordinator LLM runs.
        Automatically replicated to all followers."""
        self._shared["instructions"] = instructions

    def get_instructions(self) -> dict:
        return self._shared.get("instructions", {})

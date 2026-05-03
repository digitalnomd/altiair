"""
gossip/listener.py

ZeroMQ SUB socket.
Connects to every other node's PUB socket and writes received
states into WorldState. This is how every node always has a full
picture of what every other node is seeing.

If a node dies, its gossip stops arriving — WorldState.get_active_nodes()
will automatically exclude it after NODE_TIMEOUT seconds.
"""

import json
import threading
import logging
import zmq

from state.world_state import WorldState

logger = logging.getLogger(__name__)


class GossipListener:
    def __init__(
        self,
        node_id: str,
        node_ips: dict,  # {node_id: ip_address}
        port: int,
        world_state: WorldState,
    ):
        self._node_id = node_id
        self._world_state = world_state
        self._running = False

        self._context = zmq.Context()
        self._socket = self._context.socket(zmq.SUB)
        self._socket.setsockopt_string(zmq.SUBSCRIBE, "")  # receive everything
        self._socket.setsockopt(zmq.RCVTIMEO, 200)  # non-blocking with 200ms timeout

        for nid, ip in node_ips.items():
            if nid != node_id:
                addr = f"tcp://{ip}:{port}"
                self._socket.connect(addr)
                logger.info(f"[Gossip] Subscribed to {nid} @ {addr}")

    def start(self) -> None:
        self._running = True
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def _loop(self) -> None:
        while self._running:
            try:
                msg = self._socket.recv_string()
                data = json.loads(msg)

                sender = data.get("node_id")
                state = data.get("state", {})

                if sender and sender != self._node_id:
                    self._world_state.update_node_state(sender, state)
                    logger.debug(f"[Gossip] Got state from {sender}")

            except zmq.Again:
                pass  # timeout — no message this cycle, totally fine
            except (json.JSONDecodeError, KeyError):
                logger.warning("[Gossip] Malformed message — skipping")
            except Exception as e:
                logger.error(f"[Gossip] Listener error: {e}")

    def stop(self) -> None:
        self._running = False

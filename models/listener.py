"""
Gossip listener.

Subscribes to peer node publishers and writes every received fused state into
WorldState. If a node goes dark, WorldState marks it inactive after the timeout.
"""

from __future__ import annotations

import json
import logging
import threading

import zmq

try:
    from world_state import WorldState
except ImportError:  # pragma: no cover
    from .world_state import WorldState  # type: ignore

logger = logging.getLogger(__name__)


class GossipListener:
    def __init__(
        self,
        node_id: str,
        node_ips: dict[str, str],
        port: int,
        world_state: WorldState,
    ):
        self._node_id = node_id
        self._world_state = world_state
        self._running = False

        self._context = zmq.Context()
        self._socket = self._context.socket(zmq.SUB)
        self._socket.setsockopt_string(zmq.SUBSCRIBE, "")
        self._socket.setsockopt(zmq.RCVTIMEO, 200)

        for peer_id, ip_address in node_ips.items():
            if peer_id == node_id:
                continue
            address = f"tcp://{ip_address}:{port}"
            self._socket.connect(address)
            logger.info("[Gossip] Subscribed to %s at %s", peer_id, address)

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self) -> None:
        while self._running:
            try:
                message = self._socket.recv_string()
                data = json.loads(message)
                sender = data.get("node_id")
                payload = data.get("state", data)

                if isinstance(sender, str) and sender and sender != self._node_id:
                    self._world_state.ingest_gossip(sender, payload)
                    logger.debug("[Gossip] Got state from %s", sender)

            except zmq.Again:
                continue
            except json.JSONDecodeError:
                logger.warning("[Gossip] Malformed JSON message")
            except Exception as error:
                logger.warning("[Gossip] Listener error: %s", error)

    def stop(self) -> None:
        self._running = False
        try:
            self._socket.close(0)
            self._context.term()
        except Exception:
            pass

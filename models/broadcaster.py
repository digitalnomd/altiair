"""
Gossip broadcaster.

Publishes the local node's fused state and latest coordinator output every
GOSSIP_INTERVAL. This is the shared-awareness layer; it does not wait for a
coordinator or a response from peers.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import zmq

logger = logging.getLogger(__name__)


class GossipBroadcaster:
    def __init__(
        self,
        node_id: str,
        port: int,
        payload_factory: Callable[[], dict[str, Any]] | None = None,
    ):
        self._node_id = node_id
        self._context = zmq.Context()
        self._socket = self._context.socket(zmq.PUB)
        self._socket.bind(f"tcp://*:{port}")
        self._state: dict[str, Any] = {}
        self._payload_factory = payload_factory
        self._lock = threading.Lock()
        self._running = False
        logger.info("[Gossip] Broadcaster bound on port %s", port)

    def update_state(self, state: dict[str, Any]) -> None:
        with self._lock:
            self._state = dict(state or {})

    def start(self, interval: float = 0.5) -> None:
        self._running = True
        threading.Thread(target=self._loop, args=(interval,), daemon=True).start()

    def _loop(self, interval: float) -> None:
        time.sleep(0.5)
        while self._running:
            payload = self._build_payload()
            if payload:
                message = json.dumps(
                    {
                        "type": "altiair.gossip.message.v1",
                        "node_id": self._node_id,
                        "state": payload,
                        "timestamp": time.time(),
                    },
                    separators=(",", ":"),
                )
                self._socket.send_string(message)
                fused = payload.get("fused") if isinstance(payload, dict) else None
                summary = fused.get("summary", "") if isinstance(fused, dict) else ""
                logger.debug("[Gossip] Broadcast: %s", summary[:80])
            time.sleep(interval)

    def _build_payload(self) -> dict[str, Any]:
        if self._payload_factory is not None:
            try:
                return self._payload_factory()
            except Exception as error:
                logger.warning("[Gossip] Payload factory failed: %s", error)
        with self._lock:
            return dict(self._state)

    def stop(self) -> None:
        self._running = False
        try:
            self._socket.close(0)
            self._context.term()
        except Exception:
            pass

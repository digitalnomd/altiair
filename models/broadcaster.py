"""
gossip/broadcaster.py

ZeroMQ PUB socket.
Runs in a background thread, continuously publishing our latest
fused sensor state to every other node that is subscribed.

No knowledge of who is listening — just broadcast and forget.
"""

import json
import time
import threading
import logging
import zmq

logger = logging.getLogger(__name__)


class GossipBroadcaster:
    def __init__(self, node_id: str, port: int):
        self._node_id = node_id
        self._context = zmq.Context()
        self._socket = self._context.socket(zmq.PUB)
        self._socket.bind(f"tcp://*:{port}")
        self._state = {}
        self._lock = threading.Lock()
        self._running = False
        logger.info(f"[Gossip] Broadcaster bound on port {port}")

    def update_state(self, state: dict) -> None:
        """Called from the main fusion loop every time we have new output."""
        with self._lock:
            self._state = state

    def start(self, interval: float = 0.5) -> None:
        self._running = True
        t = threading.Thread(target=self._loop, args=(interval,), daemon=True)
        t.start()

    def _loop(self, interval: float) -> None:
        # Small delay — PUB needs a moment before subscribers connect
        time.sleep(0.5)
        while self._running:
            with self._lock:
                state = dict(self._state)
            if state:
                msg = json.dumps(
                    {
                        "node_id": self._node_id,
                        "state": state,
                        "timestamp": time.time(),
                    }
                )
                self._socket.send_string(msg)
                logger.debug(f"[Gossip] Broadcast: {state.get('summary','')[:50]}")
            time.sleep(interval)

    def stop(self) -> None:
        self._running = False

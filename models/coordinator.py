"""
raft/coordinator.py

The coordinator LLM.

- Only runs when this node is the Raft leader
- Reads world state (all nodes' fused sensor outputs) from gossip layer
- Adds the mission objective
- Outputs per-node tactical instructions
- Pushes output via Raft (replicated to all nodes automatically)

When this node dies:
  → Raft elects a new leader in <1s
  → New leader starts running THIS loop
  → World state is already populated from gossip
  → Mission continues with zero gap
"""

import json
import time
import logging
import threading
from typing import Optional

from state.world_state import WorldState

logger = logging.getLogger(__name__)


class CoordinatorLLM:
    def __init__(
        self,
        node_id: str,
        world_state: WorldState,
        model_path: str,
        mission: str,
    ):
        self._node_id = node_id
        self._world_state = world_state
        self._mission = mission
        self._running = False
        self._llm = None
        self._model_path = model_path

    def _load_model(self):
        if self._llm is not None:
            return
        from llama_cpp import Llama

        logger.info("[Coordinator] Loading LLM...")
        self._llm = Llama(
            model_path=self._model_path,
            n_gpu_layers=32,  # push all layers to Jetson CUDA
            n_ctx=2048,
            verbose=False,
        )
        logger.info("[Coordinator] LLM ready")

    def start(self, raft_node, interval: float = 3.0) -> None:
        self._running = True
        t = threading.Thread(
            target=self._loop,
            args=(raft_node, interval),
            daemon=True,
        )
        t.start()

    def _loop(self, raft_node, interval: float) -> None:
        self._load_model()

        while self._running:
            if raft_node.is_leader():
                logger.info(f"[Coordinator] I am leader — running inference")
                try:
                    self._run(raft_node)
                except Exception as e:
                    logger.error(f"[Coordinator] Error: {e}")
            else:
                # Not leader — pull instructions that the leader pushed via Raft
                replicated_instructions = raft_node.get_instructions()
                if replicated_instructions:
                    self._world_state.update_instructions(replicated_instructions)
                logger.debug(
                    f"[Coordinator] Follower — leader is {raft_node.get_leader_address()}"
                )

            time.sleep(interval)

    def _run(self, raft_node) -> None:
        all_states = self._world_state.get_all_states()
        active_nodes = self._world_state.get_active_nodes()

        if not all_states:
            logger.warning("[Coordinator] No node states yet — skipping cycle")
            return

        # Build node report block
        node_reports = []
        for nid in active_nodes:
            state = all_states.get(nid, {})
            node_reports.append(
                f"  {nid}: {state.get('summary', 'no data')} | "
                f"threat={state.get('threat_detected', False)} | "
                f"bearing={state.get('estimated_bearing', '?')}° | "
                f"distance={state.get('estimated_distance', '?')} | "
                f"confidence={state.get('confidence', 0)}%"
            )

        nodes_str = ", ".join(active_nodes)
        report_str = "\n".join(node_reports) if node_reports else "  none"

        prompt = f"""You are a tactical AI coordinator for a decentralized soldier mesh network.
Each node is a soldier carrying sensors in the field. 

MISSION: {self._mission}

ACTIVE NODES: {nodes_str}

LIVE SENSOR REPORTS:
{report_str}

Based on the above, output the next tactical action for each active node.
Be specific: include bearing, distance, and action verb.
One sentence per node. No preamble. Output valid JSON only.

Format:
{{
  "node_1": "Hold position at bearing 047, maintain drone in camera frame",
  "node_2": "Move south 100m, scan treeline at bearing 180-220 for operator"
}}

JSON output:"""

        response = self._llm(
            prompt,
            max_tokens=400,
            temperature=0.1,
            stop=["```", "\n\n\n"],
        )

        raw = response["choices"][0]["text"].strip()

        try:
            instructions = json.loads(raw)
            # Push via Raft — all followers will receive this automatically
            raft_node.set_instructions(instructions)
            # Also update our own world state immediately
            self._world_state.update_instructions(instructions)
            logger.info(f"[Coordinator] Instructions issued: {instructions}")
        except json.JSONDecodeError:
            logger.warning(f"[Coordinator] Bad JSON from LLM: {raw[:200]}")

    def stop(self) -> None:
        self._running = False

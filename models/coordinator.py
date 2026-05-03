"""
Coordinator LLM.

Only the elected leader runs coordinator inference. It reads the world state
populated by gossip and emits per-node non-kinetic verification instructions.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

try:
    import config
    from llm import parse_json_object
    from world_state import WorldState
except ImportError:  # pragma: no cover
    from . import config  # type: ignore
    from .llm import parse_json_object  # type: ignore
    from .world_state import WorldState  # type: ignore

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

    def _load_model(self) -> None:
        if self._llm is not None:
            return
        if not self._model_path or not os.path.exists(self._model_path):
            logger.warning("[Coordinator] Model file missing; using deterministic fallback: %s", self._model_path)
            return
        try:
            from llama_cpp import Llama

            logger.info("[Coordinator] Loading LLM from %s", self._model_path)
            self._llm = Llama(
                model_path=self._model_path,
                n_gpu_layers=config.LLM_GPU_LAYERS,
                n_ctx=2048,
                verbose=False,
            )
            logger.info("[Coordinator] LLM ready")
        except Exception as error:
            logger.warning("[Coordinator] llama-cpp unavailable; using deterministic fallback: %s", error)

    def start(self, raft_node, interval: float = 3.0) -> None:
        self._running = True
        threading.Thread(target=self._loop, args=(raft_node, interval), daemon=True).start()

    def _loop(self, raft_node, interval: float) -> None:
        self._load_model()

        while self._running:
            leader_id = get_leader_id(raft_node)
            self._world_state.set_leader(leader_id)

            if raft_node.is_leader():
                logger.info("[Coordinator] I am leader; running coordinator cycle")
                try:
                    self._run(raft_node)
                except Exception as error:
                    logger.warning("[Coordinator] Cycle failed: %s", error)
            else:
                replicated = raft_node.get_instructions()
                if replicated:
                    self._world_state.update_instructions(replicated)
                logger.debug("[Coordinator] Follower; leader is %s", raft_node.get_leader_address())

            time.sleep(interval)

    def _run(self, raft_node) -> None:
        all_states = self._world_state.get_all_states()
        active_nodes = self._world_state.get_active_nodes()

        if not all_states:
            logger.info("[Coordinator] No fused node states yet; skipping")
            return

        output = self._llm_coordinate(all_states, active_nodes) if self._llm else self._fallback_coordinate(all_states, active_nodes)
        output = self._normalize_output(output, all_states, active_nodes)

        instructions = output["instructions"]
        raft_node.set_instructions(instructions)
        self._world_state.update_coordinator_output(output)
        logger.info("[Coordinator] Instructions issued: %s", instructions)

    def _llm_coordinate(
        self,
        all_states: dict[str, dict[str, Any]],
        active_nodes: list[str],
    ) -> dict[str, Any]:
        prompt = self._build_prompt(all_states, active_nodes)
        raw = self._run_prompt(prompt)
        parsed = parse_json_object(raw)
        if parsed is not None:
            return parsed

        logger.warning("[Coordinator] Bad JSON from LLM, retrying once: %s", raw[:180])
        retry_raw = self._run_prompt(
            f"{prompt}\n\nYour previous answer was invalid. Return only the JSON object."
        )
        parsed = parse_json_object(retry_raw)
        if parsed is not None:
            return parsed

        logger.warning("[Coordinator] Retry failed; using deterministic fallback: %s", retry_raw[:180])
        return self._fallback_coordinate(all_states, active_nodes)

    def _run_prompt(self, prompt: str) -> str:
        response = self._llm(
            prompt,
            max_tokens=420,
            temperature=0.1,
            stop=["```", "\n\n\n"],
        )
        return str(response["choices"][0]["text"]).strip()

    def _build_prompt(self, all_states: dict[str, dict[str, Any]], active_nodes: list[str]) -> str:
        reports = []
        for node_id in active_nodes:
            state = all_states.get(node_id, {})
            reports.append(
                f"{node_id}: {state.get('summary', 'no data')} | "
                f"threat={state.get('threat_detected', False)} | "
                f"type={state.get('threat_type', 'none')} | "
                f"bearing={state.get('estimated_bearing', '?')} | "
                f"distance={state.get('estimated_distance', '?')} | "
                f"confidence={state.get('confidence', 0)}"
            )

        return f"""You are the elected coordinator for an edge sensor mesh.
Mission: {self._mission}

Active nodes: {", ".join(active_nodes) or "none"}

Fused reports:
{chr(10).join(reports)}

Return JSON only:
{{
  "recommended_next_action": "short overall next check",
  "operator_next_action": "instruction for this display operator",
  "policy_gate": "review_needed",
  "instructions": {{
    "node_1": "Maintain observation and keep the cue in frame.",
    "node_2": "Shift east only if safe and verify visual."
  }},
  "rationale": ["evidence-grounded reason"]
}}

Rules:
- Verification, observation, relay, and deconfliction only.
- Do not recommend engagement, pursuit, harm, or target prosecution.
- Keep each node instruction to one sentence."""

    def _fallback_coordinate(
        self,
        all_states: dict[str, dict[str, Any]],
        active_nodes: list[str],
    ) -> dict[str, Any]:
        active = active_nodes or sorted(all_states)
        sorted_reports = sorted(
            ((node_id, all_states.get(node_id, {})) for node_id in active),
            key=lambda item: int(item[1].get("confidence", 0) or 0),
            reverse=True,
        )
        primary_node, primary_state = sorted_reports[0] if sorted_reports else (self._node_id, {})
        threat_detected = bool(primary_state.get("threat_detected"))
        bearing = primary_state.get("estimated_bearing")
        confidence = int(primary_state.get("confidence", 0) or 0)

        instructions: dict[str, str] = {}
        for index, node_id in enumerate(active):
            if not threat_detected:
                instructions[node_id] = "Continue local sensing and report fresh camera, audio, and RF evidence."
            elif node_id == primary_node:
                instructions[node_id] = (
                    f"Maintain observation of the cue at bearing {format_bearing(bearing)} and keep evidence flowing."
                )
            elif index % 3 == 0:
                instructions[node_id] = (
                    f"Relay mesh updates and watch for contradictions near bearing {format_bearing(bearing)}."
                )
            elif index % 3 == 1:
                instructions[node_id] = (
                    f"Shift only if safe to verify visual coverage near bearing {format_bearing(bearing)}."
                )
            else:
                instructions[node_id] = "Hold position and preserve a second sensor angle for quorum."

        recommended = (
            f"{display_node(primary_node)} maintain observation; peers verify bearing {format_bearing(bearing)}"
            if threat_detected
            else "Continue sensing until at least two independent signals agree"
        )
        operator_action = instructions.get(self._node_id) or recommended

        return {
            "recommended_next_action": recommended,
            "operator_next_action": operator_action,
            "policy_gate": "review_needed",
            "instructions": instructions,
            "rationale": [
                f"Highest confidence fused report is {confidence}% from {primary_node}.",
                "Coordinator output is limited to observation and verification.",
            ],
        }

    def _normalize_output(
        self,
        output: dict[str, Any],
        all_states: dict[str, dict[str, Any]],
        active_nodes: list[str],
    ) -> dict[str, Any]:
        if not isinstance(output, dict):
            output = self._fallback_coordinate(all_states, active_nodes)

        instructions = output.get("instructions")
        if not isinstance(instructions, dict) or not instructions:
            instructions = self._fallback_coordinate(all_states, active_nodes)["instructions"]

        normalized_instructions = {
            str(node_id): sanitize_instruction(str(instruction))
            for node_id, instruction in instructions.items()
        }

        recommended = sanitize_instruction(
            str(output.get("recommended_next_action") or "Maintain observation and verify with another sensor.")
        )
        operator = sanitize_instruction(
            str(output.get("operator_next_action") or normalized_instructions.get(self._node_id) or recommended)
        )
        policy_gate = str(output.get("policy_gate") or "review_needed")
        if policy_gate not in {"collect_only", "review_needed", "authorized_to_share", "blocked"}:
            policy_gate = "review_needed"

        rationale = output.get("rationale")
        if not isinstance(rationale, list):
            rationale = []

        return {
            "leader_id": self._node_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "mission": self._mission,
            "recommended_next_action": recommended,
            "operator_next_action": operator,
            "policy_gate": policy_gate,
            "instructions": normalized_instructions,
            "rationale": [str(item)[:220] for item in rationale[:4]],
        }

    def stop(self) -> None:
        self._running = False


def get_leader_id(raft_node) -> str | None:
    if hasattr(raft_node, "get_leader_id"):
        return raft_node.get_leader_id()
    return None


def format_bearing(value: Any) -> str:
    try:
        return f"{int(value):03d}"
    except (TypeError, ValueError):
        return "unknown"


def display_node(node_id: str) -> str:
    if node_id.startswith("node_"):
        return f"Node {node_id.rsplit('_', 1)[-1]}"
    return node_id


def sanitize_instruction(value: str) -> str:
    blocked_terms = {
        "target": "cue",
        "hostile": "unknown",
        "engage": "observe",
        "pursue": "verify",
        "attack": "observe",
        "shoot": "observe",
        "capture": "confirm",
    }
    cleaned = value.strip()
    for term, replacement in blocked_terms.items():
        cleaned = cleaned.replace(term, replacement).replace(term.title(), replacement.title())
    return cleaned[:220]

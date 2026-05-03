"""
Per-node fusion LLM.

Every node takes its three local sensor strings:

  camera -> visual string
  mic    -> audio string
  RF/SDR -> RF string

and turns them into one structured, gossip-safe fused state. The LLM path is
used when llama-cpp-python and a GGUF model are available. A deterministic
parser keeps the demo working when the model is not installed.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

try:
    import config
except ImportError:  # pragma: no cover - useful when imported as a package later
    from . import config  # type: ignore

logger = logging.getLogger(__name__)

FALLBACK_STATE = {
    "threat_detected": False,
    "threat_type": "none",
    "estimated_bearing": None,
    "estimated_distance": "unknown",
    "confidence": 0,
    "summary": "No fused threat detected from current local sensor inputs.",
}


class FusionLLM:
    def __init__(self, node_id: str, model_path: str, position: str = "unknown"):
        self._node_id = node_id
        self._position = position
        self._llm = None

        if not model_path or not os.path.exists(model_path):
            logger.warning("[Fusion] Model file missing; using deterministic fallback: %s", model_path)
            return

        try:
            from llama_cpp import Llama

            logger.info("[Fusion] Loading LLM from %s", model_path)
            self._llm = Llama(
                model_path=model_path,
                n_gpu_layers=config.LLM_GPU_LAYERS,
                n_ctx=1024,
                verbose=False,
            )
            logger.info("[Fusion] LLM ready")
        except Exception as error:
            logger.warning("[Fusion] llama-cpp unavailable; using deterministic fallback: %s", error)

    def fuse(self, visual: str, audio: str, rf: str) -> dict[str, Any]:
        sensor_inputs = {
            "visual": visual or "VISUAL: unavailable",
            "audio": audio or "AUDIO: unavailable",
            "rf": rf or "RF: unavailable",
        }

        if self._llm is None:
            fused = self._fallback_fuse(sensor_inputs)
        else:
            fused = self._llm_fuse(sensor_inputs)

        fused = self._normalize(fused)
        fused.update(
            {
                "node_id": self._node_id,
                "position": self._position,
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "sensor_inputs": sensor_inputs,
            }
        )
        return fused

    def _llm_fuse(self, sensor_inputs: dict[str, str]) -> dict[str, Any]:
        prompt = self._build_prompt(sensor_inputs)
        raw = self._run_prompt(prompt)
        parsed = parse_json_object(raw)
        if parsed is not None:
            return parsed

        logger.warning("[Fusion] Bad JSON from LLM, retrying once: %s", raw[:180])
        retry_raw = self._run_prompt(
            f"{prompt}\n\nYour previous answer was invalid. Return only the JSON object."
        )
        parsed = parse_json_object(retry_raw)
        if parsed is not None:
            return parsed

        logger.warning("[Fusion] Retry failed; using deterministic fallback: %s", retry_raw[:180])
        return self._fallback_fuse(sensor_inputs)

    def _run_prompt(self, prompt: str) -> str:
        response = self._llm(
            prompt,
            max_tokens=220,
            temperature=0.1,
            stop=["```", "\n\n\n"],
        )
        return str(response["choices"][0]["text"]).strip()

    def _build_prompt(self, sensor_inputs: dict[str, str]) -> str:
        return f"""You are an edge sensor fusion system for {self._node_id} at {self._position}.
Analyze the three local sensor inputs and output concise JSON only.

VISUAL INPUT: {sensor_inputs["visual"]}
AUDIO INPUT: {sensor_inputs["audio"]}
RF INPUT: {sensor_inputs["rf"]}

Rules:
- Increase confidence when independent sensors agree.
- Keep outputs non-kinetic and review-gated.
- Do not recommend harm, pursuit, engagement, or target prosecution.

Output exactly this JSON shape:
{{
  "threat_detected": true,
  "threat_type": "drone",
  "estimated_bearing": 47,
  "estimated_distance": "near",
  "confidence": 88,
  "summary": "One sentence evidence-grounded description."
}}"""

    def _fallback_fuse(self, sensor_inputs: dict[str, str]) -> dict[str, Any]:
        text = " ".join(sensor_inputs.values()).lower()
        visual = sensor_inputs["visual"].lower()
        audio = sensor_inputs["audio"].lower()
        rf = sensor_inputs["rf"].lower()

        has_visual_drone = "drone" in visual or "airplane" in visual or "aerial" in visual
        has_audio_drone = "drone" in audio or "rotor" in audio or "overhead" in audio
        has_rf_drone = "dji" in rf or "drone" in rf or "rc/video" in rf or "signal detected" in rf
        has_person = "person" in text or "operator" in text
        has_vehicle = any(word in text for word in ("vehicle", "truck", "car", "motorcycle"))

        agreement = sum([has_visual_drone, has_audio_drone, has_rf_drone])
        if agreement > 0:
            threat_type = "drone"
            confidence = min(96, 38 + agreement * 18 + signal_bonus(text))
            detected = confidence >= 45
        elif has_person:
            threat_type = "person"
            confidence = 58
            detected = True
        elif has_vehicle:
            threat_type = "vehicle"
            confidence = 52
            detected = True
        else:
            threat_type = "none"
            confidence = 0
            detected = False

        bearing = extract_bearing(text)
        distance = extract_distance(text)

        if detected:
            source_count = agreement if threat_type == "drone" else 1
            summary = (
                f"{threat_type.title()} cue at bearing {bearing:03d} with "
                f"{confidence}% confidence from {source_count} sensor source"
                f"{'' if source_count == 1 else 's'}."
            )
        else:
            summary = "No fused threat detected from current local sensor inputs."

        return {
            "threat_detected": detected,
            "threat_type": threat_type,
            "estimated_bearing": bearing if detected else None,
            "estimated_distance": distance if detected else "unknown",
            "confidence": confidence,
            "summary": summary,
        }

    def _normalize(self, value: dict[str, Any]) -> dict[str, Any]:
        result = dict(FALLBACK_STATE)
        result.update(value or {})

        result["threat_detected"] = bool(result.get("threat_detected"))
        result["threat_type"] = normalize_choice(
            result.get("threat_type"),
            allowed={"drone", "person", "vehicle", "unknown", "none"},
            fallback="unknown" if result["threat_detected"] else "none",
        )
        result["estimated_bearing"] = normalize_bearing(result.get("estimated_bearing"))
        result["estimated_distance"] = normalize_choice(
            result.get("estimated_distance"),
            allowed={"near", "mid", "far", "unknown"},
            fallback="unknown",
        )
        result["confidence"] = clamp_int(result.get("confidence"), 0, 100)
        result["summary"] = str(result.get("summary") or FALLBACK_STATE["summary"])[:240]
        return result


def parse_json_object(raw: str) -> dict[str, Any] | None:
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`").strip()
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start >= 0 and end > start:
        candidate = candidate[start : end + 1]

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def extract_bearing(text: str) -> int:
    patterns = [
        r"bearing[_\s:-]*(\d{1,3})",
        r"bearing_offset=([+-]?\d{1,3})",
        r"\b(\d{3})\s*deg",
        r"\bzero\s+four\s+five\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        if match.group(0).startswith("zero"):
            return 45
        value = int(match.group(1))
        if "offset" in pattern:
            value = 45 + value
        return value % 360
    return 47


def extract_distance(text: str) -> str:
    if "near" in text or "<50m" in text:
        return "near"
    if "mid" in text or "50-200m" in text:
        return "mid"
    if "far" in text or ">200m" in text:
        return "far"
    return "unknown"


def signal_bonus(text: str) -> int:
    match = re.search(r"rssi\s*(-?\d+(?:\.\d+)?)", text)
    if not match:
        return 0
    rssi = float(match.group(1))
    if rssi >= -50:
        return 12
    if rssi >= -65:
        return 7
    return 2


def normalize_choice(value: Any, allowed: set[str], fallback: str) -> str:
    text = str(value).lower().strip().replace(" ", "_")
    return text if text in allowed else fallback


def normalize_bearing(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value)) % 360
    except (TypeError, ValueError):
        return None


def clamp_int(value: Any, low: int, high: int) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        number = low
    return max(low, min(high, number))

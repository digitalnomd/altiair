"""
fusion/llm.py

The per-node fusion LLM.
Runs on EVERY node, EVERY cycle.

Takes the three formatted sensor strings (camera, audio, RF),
synthesizes them into a single structured JSON that captures:
- Whether a threat is present
- What type it is
- Estimated bearing and distance
- Confidence
- A one-line tactical summary

This JSON is what gets broadcast via gossip to all other nodes,
and what the coordinator LLM reads to generate per-node instructions.

Model: Phi-3-mini (3.8B, Q4 quantized = ~2.2GB) on Jetson Nano
       runs at ~2-4 tokens/sec with n_gpu_layers=32.
       For a 200-token response that's ~1-2 seconds — acceptable.
"""

import json
import logging

logger = logging.getLogger(__name__)

# Safe fallback if LLM produces malformed output
FALLBACK_STATE = {
    "threat_detected": False,
    "threat_type": "none",
    "estimated_bearing": None,
    "estimated_distance": "unknown",
    "confidence": 0,
    "summary": "Fusion error — sensor data unavailable",
}


class FusionLLM:
    def __init__(self, node_id: str, model_path: str, position: str = "unknown"):
        from llama_cpp import Llama

        logger.info("[Fusion] Loading LLM...")
        self._llm = Llama(
            model_path=model_path,
            n_gpu_layers=32,  # all layers → Jetson Nano CUDA
            n_ctx=1024,
            verbose=False,
        )
        self._node_id = node_id
        self._position = position
        logger.info("[Fusion] LLM ready")

    def fuse(self, visual: str, audio: str, rf: str) -> dict:
        """
        Combine 3 sensor strings into a structured tactical assessment.
        Returns a dict that is JSON-serializable and gossip-broadcastable.
        """
        prompt = f"""Battlefield sensor fusion. Node: {self._node_id}. Position: {self._position}.

Sensor inputs:
{visual}
{audio}
{rf}

Synthesize the above into a single tactical JSON assessment.
Cross-reference all three signals — if two signals agree, increase confidence.
Output valid JSON only, no preamble, no explanation.

{{
  "threat_detected": true or false,
  "threat_type": "drone" | "person" | "vehicle" | "none",
  "estimated_bearing": <integer degrees 0-360 or null if unknown>,
  "estimated_distance": "near" | "mid" | "far" | "unknown",
  "confidence": <integer 0-100>,
  "summary": "<one tactical sentence, max 20 words>"
}}"""

        try:
            response = self._llm(
                prompt,
                max_tokens=250,
                temperature=0.1,  # near-deterministic output
                stop=["```", "\n\n\n"],  # prevent rambling
            )
            raw = response["choices"][0]["text"].strip()

            # Strip any accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("```")[1].strip()
                if raw.startswith("json"):
                    raw = raw[4:].strip()

            result = json.loads(raw)

            # Validate required keys are present
            for key in FALLBACK_STATE:
                if key not in result:
                    result[key] = FALLBACK_STATE[key]

            logger.debug(f"[Fusion] {result.get('summary','')}")
            return result

        except json.JSONDecodeError as e:
            logger.warning(f"[Fusion] JSON parse error: {e} | raw: {raw[:150]}")
            return dict(FALLBACK_STATE)
        except Exception as e:
            logger.error(f"[Fusion] LLM error: {e}")
            return dict(FALLBACK_STATE)

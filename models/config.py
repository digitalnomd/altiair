"""
Runtime configuration for one Altiair mesh node.

Each physical node runs the same Python process. Override values with
environment variables instead of editing this file on every device:

  ALTIAIR_NODE_ID=node_2 python models/main.py
"""

import os
import socket


def env_str(name: str, fallback: str) -> str:
    return os.environ.get(name, fallback)


def env_int(name: str, fallback: int) -> int:
    value = os.environ.get(name)
    return fallback if value is None else int(value)


def env_float(name: str, fallback: float) -> float:
    value = os.environ.get(name)
    return fallback if value is None else float(value)


def detect_local_ip(fallback: str) -> str:
    """Best-effort display/API IP for DHCP Wi-Fi or Ethernet bring-up.

    This does not require the internet; UDP connect only asks the OS which
    local address it would use for a normal routed packet.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            detected = sock.getsockname()[0]
            if detected and not detected.startswith("127."):
                return detected
    except OSError:
        pass

    try:
        detected = socket.gethostbyname(socket.gethostname())
        if detected and not detected.startswith("127."):
            return detected
    except OSError:
        pass

    return fallback


NODE_ID = env_str("ALTIAIR_NODE_ID", "node_1")

# All nodes on the local Wi-Fi mesh. Add/remove entries to match the field set.
NODES = {
    "node_1": env_str("ALTIAIR_NODE_1_IP", "192.168.42.1"),
    "node_2": env_str("ALTIAIR_NODE_2_IP", "192.168.42.2"),
    "node_3": env_str("ALTIAIR_NODE_3_IP", "192.168.42.3"),
    "node_4": env_str("ALTIAIR_NODE_4_IP", "192.168.42.4"),
}

MY_IP = env_str("ALTIAIR_MY_IP", detect_local_ip(NODES.get(NODE_ID, "127.0.0.1")))

# Ports.
GOSSIP_PUB_PORT = env_int("ALTIAIR_GOSSIP_PORT", 5555)
GOSSIP_SUB_PORT = GOSSIP_PUB_PORT
RAFT_PORT = env_int("ALTIAIR_RAFT_PORT", 4321)
DASHBOARD_PORT = env_int("ALTIAIR_DASHBOARD_PORT", 8080)

# Models. If these files or llama-cpp-python are missing, deterministic
# fallbacks still run so the full pipeline and UI remain testable.
FUSION_MODEL_PATH = env_str("ALTIAIR_FUSION_MODEL", "models/phi-3-mini-q4.gguf")
COORDINATOR_MODEL_PATH = env_str("ALTIAIR_COORDINATOR_MODEL", FUSION_MODEL_PATH)
LLM_GPU_LAYERS = env_int("ALTIAIR_LLM_GPU_LAYERS", 32)
COORDINATOR_MODE = env_str("ALTIAIR_COORDINATOR_MODE", "local")

# Sensors. Missing hardware or libraries automatically fall back to simulation.
CAMERA_INDEX = env_int("ALTIAIR_CAMERA_INDEX", 0)
YOLO_MODEL = env_str("ALTIAIR_YOLO_MODEL", "yolov8n.pt")
AUDIO_SAMPLE_RATE = env_int("ALTIAIR_AUDIO_SAMPLE_RATE", 16000)
AUDIO_CHUNK_SECONDS = env_int("ALTIAIR_AUDIO_CHUNK_SECONDS", 2)
RFID_POLL_INTERVAL = env_float("ALTIAIR_RFID_POLL_INTERVAL", 0.5)
RFID_SIMULATION_ENABLED = env_str("ALTIAIR_RFID_SIMULATION", "true").lower() in {"1", "true", "yes", "on"}

# Backward-compatible placeholders for older calls. The current RF adapter is
# RC522 RFID, not SDR spectrum scanning.
RF_CENTER_FREQ = env_float("ALTIAIR_RF_CENTER_FREQ", 0.0)
RF_SAMPLE_RATE = env_float("ALTIAIR_RF_SAMPLE_RATE", 0.0)

# Mission language stays non-kinetic: the system emits evidence, confidence,
# verification checks, and operator acknowledgements only.
MISSION_NAME = env_str("ALTIAIR_MISSION_NAME", "Locate aerial anomaly")
MISSION_OBJECTIVE = env_str(
    "ALTIAIR_MISSION_OBJECTIVE",
    (
        "Locate and maintain observation of an authorized training aerial cue. "
        "Fuse camera, audio, and RF evidence, estimate confidence, and recommend "
        "non-contact verification steps for human review."
    ),
)

# Timing.
GOSSIP_INTERVAL = env_float("ALTIAIR_GOSSIP_INTERVAL", 0.5)
FUSION_INTERVAL = env_float("ALTIAIR_FUSION_INTERVAL", 2.0)
COORDINATOR_INTERVAL = env_float("ALTIAIR_COORDINATOR_INTERVAL", 3.0)
NODE_TIMEOUT = env_float("ALTIAIR_NODE_TIMEOUT", 4.0)

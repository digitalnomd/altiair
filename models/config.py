# ============================================================
# config.py — Change NODE_ID on each physical device
# ============================================================

NODE_ID = "node_1"  # node_1 / node_2 / node_3 / node_4

# All nodes on the mesh WiFi network
NODES = {
    "node_1": "192.168.42.1",
    "node_2": "192.168.42.2",
    "node_3": "192.168.42.3",
    "node_4": "192.168.42.4",
}

MY_IP = NODES[NODE_ID]

# ---- Ports ----
GOSSIP_PUB_PORT = 5555  # ZMQ PUB socket — we broadcast on this
GOSSIP_SUB_PORT = 5555  # ZMQ SUB socket — we receive others on this
RAFT_PORT = 4321  # Raft consensus port
DASHBOARD_PORT = 8080  # iPad web dashboard

# ---- Models ----
FUSION_MODEL_PATH = "models/phi-3-mini-q4.gguf"
COORDINATOR_MODEL_PATH = "models/phi-3-mini-q4.gguf"  # can be same model

# ---- Sensors ----
CAMERA_INDEX = 0
YOLO_MODEL = "yolov8n.pt"  # auto-downloaded on first run
AUDIO_SAMPLE_RATE = 16000
AUDIO_CHUNK_SECONDS = 2
RF_CENTER_FREQ = 2.437e9  # DJI primary band (2.4GHz)
RF_SAMPLE_RATE = 2.4e6

# ---- Mission ----
MISSION_OBJECTIVE = (
    "Locate and track hostile drone operator. "
    "Drone confirmed at bearing 047. "
    "Find, fix, target the operator. "
    "Drone operators stay within 500m — scan treeline."
)

# ---- Timing ----
GOSSIP_INTERVAL = 0.5  # seconds between gossip broadcasts
FUSION_INTERVAL = 1.0  # seconds between fusion LLM cycles
COORDINATOR_INTERVAL = 3.0  # seconds between coordinator LLM cycles
NODE_TIMEOUT = 4.0  # seconds before a node is considered dead

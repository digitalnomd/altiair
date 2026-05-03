# scenario.py
#
# ALL pre-scripted data lives here.
# The intelligence of the output matters, not the latency.
# Nothing in this file runs an LLM — it IS the LLM output.
#
# Two phases:
#   phase_0 → normal operation, node_1 is coordinator
#   phase_1 → node_1 is dead, node_2 is coordinator
#
# Nodes 3 and 4 are simulated (no real hardware).
# Their states are hardcoded and injected into world state on startup.

NODE_STATES = {
    "node_1": {
        "phase_0": {
            "visual": "drone conf=0.91 bearing_offset=+12° far(>200m)",
            "audio": '"drone overhead, moving south" [KEYWORD: drone]',
            "rf": "SIGNAL -52dBm @ 2.437GHz // DJI primary band // RC link active",
            "fused": {
                "threat_detected": True,
                "threat_type": "drone",
                "estimated_bearing": 47,
                "estimated_distance": "far",
                "confidence": 91,
                "summary": "DJI-class drone bearing 047 ~200m. RF + visual + audio confirm. RC operator nearby.",
            },
        }
        # phase_1: node_1 is offline — no data
    },
    "node_2": {
        "phase_0": {
            "visual": "no threats detected in frame",
            "audio": "ambient only, no speech detected",
            "rf": "SIGNAL -68dBm @ 2.437GHz // DJI band // weak signal",
            "fused": {
                "threat_detected": False,
                "threat_type": "none",
                "estimated_bearing": None,
                "estimated_distance": "unknown",
                "confidence": 0,
                "summary": "No direct visual. RF signal faint but present on DJI band. Advancing south.",
            },
        },
        "phase_1": {
            "visual": "drone conf=0.73 bearing_offset=-5° far(>200m)",
            "audio": '"advancing to Node 1 position, drone in sight" [KEYWORD: drone]',
            "rf": "SIGNAL -57dBm @ 2.437GHz // DJI band // strengthening",
            "fused": {
                "threat_detected": True,
                "threat_type": "drone",
                "estimated_bearing": 47,
                "estimated_distance": "far",
                "confidence": 73,
                "summary": "Acquired drone bearing 047 from N1 last position. Assuming coordination. RF strengthening.",
            },
        },
    },
    # Simulated — no real device, state is static/injected
    "node_3": {
        "phase_0": {
            "visual": "person conf=0.67 bearing_offset=+5° mid(50-200m)",
            "audio": "ambient only, possible footsteps",
            "rf": "background noise -81dBm // no drone signal",
            "fused": {
                "threat_detected": True,
                "threat_type": "person",
                "estimated_bearing": 195,
                "estimated_distance": "mid",
                "confidence": 67,
                "summary": "Unidentified person south approach bearing 195, ~100m. Possible drone operator.",
            },
        }
    },
    "node_4": {
        "phase_0": {
            "visual": "no threats detected in frame",
            "audio": '"nothing on this side, sector clear"',
            "rf": "background noise -79dBm // no signal",
            "fused": {
                "threat_detected": False,
                "threat_type": "none",
                "estimated_bearing": None,
                "estimated_distance": "unknown",
                "confidence": 0,
                "summary": "Sector clear. Flanking east. Scanning treeline bearing 090-120 for operator.",
            },
        }
    },
}

# Coordinator LLM output — pre-scripted per phase.
# These are the instructions that appear on each soldier's screen.
COORDINATOR_INSTRUCTIONS = {
    "phase_0": {  # node_1 coordinating
        "node_1": "MAINTAIN DRONE IN FRAME — bearing 047. Visual lock. Hold position.",
        "node_2": "ADVANCE SOUTH 100M — scan treeline bearing 180-220 for drone operator.",
        "node_3": "HOLD POSITION — watch south approach bearing 195. Relay contact to Node 1.",
        "node_4": "FLANK EAST — scan bearing 090-120. Drone operators stay within 500m.",
    },
    "phase_1": {  # node_2 coordinating after node_1 lost
        "node_1": None,  # dead
        "node_2": "ADVANCE TO N1 LAST POSITION — bearing 047 ~80m. Assume visual on drone.",
        "node_3": "ADVANCE NORTH — cover Node 1's last position. Watch south. N1 is dark.",
        "node_4": "CONTINUE EAST FLANK — operator likely bearing 095. Converge on treeline.",
    },
}

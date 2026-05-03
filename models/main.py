"""
main.py — Entry point for each mesh node.

Startup order:
  1. WorldState          — shared memory
  2. Sensors             — camera, audio, RF (start collecting)
  3. Fusion LLM          — loads model (slowest step)
  4. Gossip              — start broadcasting + listening
  5. Raft                — connect to peers, elect leader
  6. Coordinator LLM     — loads model, starts leader loop
  7. Dashboard           — Flask server for iPad
  8. Main loop           — fuse sensors → update state → broadcast

Run with:
  python main.py

Make sure config.py has the correct NODE_ID for this device.
"""

import time
import logging
import threading

import config
from state.world_state import WorldState
from gossip.broadcaster import GossipBroadcaster
from gossip.listener import GossipListener
from raft.node import MeshRaftNode
from raft.coordinator import CoordinatorLLM
from sensors.camera import CameraSensor
from sensors.audio import AudioSensor
from sensors.rf import RFSensor
from fusion.llm import FusionLLM
from dashboard.server import create_dashboard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(name)-18s]  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


def main():
    logger.info("=" * 60)
    logger.info(f"  MESH NODE STARTING: {config.NODE_ID}")
    logger.info(f"  IP: {config.MY_IP}")
    logger.info(f"  MISSION: {config.MISSION_OBJECTIVE[:60]}...")
    logger.info("=" * 60)

    # ----------------------------------------------------------
    # 1. Shared world state
    # ----------------------------------------------------------
    world_state = WorldState(config.NODE_ID)

    # ----------------------------------------------------------
    # 2. Sensors  (start data collection immediately)
    # ----------------------------------------------------------
    camera = CameraSensor(config.CAMERA_INDEX, config.YOLO_MODEL)
    audio = AudioSensor(config.AUDIO_SAMPLE_RATE, config.AUDIO_CHUNK_SECONDS)
    rf = RFSensor(config.RF_CENTER_FREQ, config.RF_SAMPLE_RATE)

    camera.start()
    audio.start()
    rf.start()
    logger.info("Sensors started")

    # ----------------------------------------------------------
    # 3. Fusion LLM  (model load — takes 10-30s on Jetson Nano)
    # ----------------------------------------------------------
    fusion = FusionLLM(
        node_id=config.NODE_ID,
        model_path=config.FUSION_MODEL_PATH,
        position=f"grid_{config.NODE_ID}",
    )

    # ----------------------------------------------------------
    # 4. Gossip
    # ----------------------------------------------------------
    broadcaster = GossipBroadcaster(config.NODE_ID, config.GOSSIP_PUB_PORT)
    listener = GossipListener(
        config.NODE_ID,
        config.NODES,
        config.GOSSIP_SUB_PORT,
        world_state,
    )
    broadcaster.start(config.GOSSIP_INTERVAL)
    listener.start()
    logger.info("Gossip layer started")

    # ----------------------------------------------------------
    # 5. Raft
    # ----------------------------------------------------------
    my_raft_addr = f"{config.MY_IP}:{config.RAFT_PORT}"
    partner_raft_addrs = [
        f"{ip}:{config.RAFT_PORT}"
        for nid, ip in config.NODES.items()
        if nid != config.NODE_ID
    ]
    raft_node = MeshRaftNode(my_raft_addr, partner_raft_addrs)

    # Give Raft time to connect to peers and hold an election
    logger.info("Waiting for Raft election...")
    time.sleep(3.0)
    logger.info(f"Raft ready — leader: {raft_node.get_leader_address()}")

    # ----------------------------------------------------------
    # 6. Coordinator LLM
    # ----------------------------------------------------------
    coordinator = CoordinatorLLM(
        node_id=config.NODE_ID,
        world_state=world_state,
        model_path=config.COORDINATOR_MODEL_PATH,
        mission=config.MISSION_OBJECTIVE,
    )
    coordinator.start(raft_node, config.COORDINATOR_INTERVAL)
    logger.info("Coordinator LLM started")

    # ----------------------------------------------------------
    # 7. Dashboard
    # ----------------------------------------------------------
    dashboard_app = create_dashboard(config.NODE_ID, world_state, raft_node)
    threading.Thread(
        target=lambda: dashboard_app.run(
            host="0.0.0.0",
            port=config.DASHBOARD_PORT,
            debug=False,
            use_reloader=False,
        ),
        daemon=True,
    ).start()
    logger.info(f"Dashboard at http://{config.MY_IP}:{config.DASHBOARD_PORT}")

    # ----------------------------------------------------------
    # 8. Main fusion loop
    # ----------------------------------------------------------
    logger.info("Entering fusion loop — Ctrl+C to stop")
    cycle = 0

    try:
        while True:
            cycle += 1

            # Pull latest sensor outputs (these run in background threads)
            visual = camera.get_output()
            audio_out = audio.get_output()
            rf_out = rf.get_output()

            # Fuse into structured JSON
            fused = fusion.fuse(visual, audio_out, rf_out)

            # Store our own state in world state
            world_state.update_node_state(config.NODE_ID, fused)

            # Broadcast to all other nodes via gossip
            broadcaster.update_state(fused)

            # Log status
            is_leader = raft_node.is_leader()
            active_nodes = world_state.get_active_nodes()
            my_orders = world_state.get_my_instruction()

            logger.info(
                f"[cycle {cycle:04d}] "
                f"{'★ LEADER' if is_leader else '  follower'} | "
                f"active={active_nodes} | "
                f"threat={fused.get('threat_detected')} | "
                f"{fused.get('summary','')[:50]}"
            )
            if my_orders:
                logger.info(f"  ▶ MY ORDERS: {my_orders}")

            time.sleep(config.FUSION_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Shutting down...")
        camera.stop()
        audio.stop()
        rf.stop()
        broadcaster.stop()
        listener.stop()
        coordinator.stop()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    main()

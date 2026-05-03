"""
Entry point for one Altiair mesh node.

Flow on every node:
  camera/audio/RF -> FusionLLM -> local fused state -> gossip

Flow on elected leader only:
  world state from gossip + mission objective -> CoordinatorLLM -> instructions

Dashboard:
  Flask serves the UI and /api/dashboard for the browser.
"""

from __future__ import annotations

import logging
import threading
import time

import config
from audio import AudioSensor
from broadcaster import GossipBroadcaster
from camera import CameraSensor
from coordinator import CoordinatorLLM
from listener import GossipListener
from llm import FusionLLM
from node import MeshRaftNode
from rf import RFSensor
from server import create_dashboard
from world_state import WorldState

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)-18s] %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


def main() -> None:
    logger.info("=" * 60)
    logger.info("MESH NODE STARTING: %s", config.NODE_ID)
    logger.info("IP: %s", config.MY_IP)
    logger.info("MISSION: %s", config.MISSION_OBJECTIVE)
    logger.info("=" * 60)

    world_state = WorldState(config.NODE_ID)

    camera = CameraSensor(config.CAMERA_INDEX, config.YOLO_MODEL)
    audio = AudioSensor(config.AUDIO_SAMPLE_RATE, config.AUDIO_CHUNK_SECONDS)
    rf = RFSensor(config.RF_CENTER_FREQ, config.RF_SAMPLE_RATE)

    camera.start()
    audio.start()
    rf.start()
    logger.info("Sensor adapters started")

    fusion = FusionLLM(
        node_id=config.NODE_ID,
        model_path=config.FUSION_MODEL_PATH,
        position=f"grid_{config.NODE_ID}",
    )

    my_raft_addr = f"{config.MY_IP}:{config.RAFT_PORT}"
    partner_raft_addrs = [
        f"{ip_address}:{config.RAFT_PORT}"
        for node_id, ip_address in config.NODES.items()
        if node_id != config.NODE_ID
    ]
    raft_node = MeshRaftNode(
        my_raft_addr,
        partner_raft_addrs,
        node_id=config.NODE_ID,
        world_state=world_state,
    )

    broadcaster = GossipBroadcaster(
        config.NODE_ID,
        config.GOSSIP_PUB_PORT,
        payload_factory=lambda: world_state.build_gossip_payload(
            leader_id=getattr(raft_node, "get_leader_id", lambda: None)(),
            is_leader=raft_node.is_leader(),
        ),
    )
    listener = GossipListener(
        config.NODE_ID,
        config.NODES,
        config.GOSSIP_SUB_PORT,
        world_state,
    )
    broadcaster.start(config.GOSSIP_INTERVAL)
    listener.start()
    logger.info("Gossip layer started")

    logger.info("Waiting briefly for leader election...")
    time.sleep(2.0)
    logger.info("Leader: %s", raft_node.get_leader_address())

    coordinator = CoordinatorLLM(
        node_id=config.NODE_ID,
        world_state=world_state,
        model_path=config.COORDINATOR_MODEL_PATH,
        mission=config.MISSION_OBJECTIVE,
    )
    coordinator.start(raft_node, config.COORDINATOR_INTERVAL)

    dashboard_app = create_dashboard(
        config.NODE_ID,
        world_state,
        raft_node,
        mission_name=config.MISSION_NAME,
        mission_objective=config.MISSION_OBJECTIVE,
    )
    threading.Thread(
        target=lambda: dashboard_app.run(
            host="0.0.0.0",
            port=config.DASHBOARD_PORT,
            debug=False,
            use_reloader=False,
        ),
        daemon=True,
    ).start()
    logger.info("Dashboard/UI at http://%s:%s", config.MY_IP, config.DASHBOARD_PORT)

    logger.info("Entering fusion loop; press Ctrl+C to stop")
    cycle = 0

    try:
        while True:
            cycle += 1
            visual = camera.get_output()
            audio_out = audio.get_output()
            rf_out = rf.get_output()

            fused = fusion.fuse(visual, audio_out, rf_out)
            world_state.update_node_state(config.NODE_ID, fused)

            leader = raft_node.is_leader()
            active_nodes = world_state.get_active_nodes()
            my_orders = world_state.get_my_instruction()

            logger.info(
                "[cycle %04d] %s | active=%s | confidence=%s | %s",
                cycle,
                "LEADER" if leader else "follower",
                active_nodes,
                fused.get("confidence"),
                str(fused.get("summary", ""))[:90],
            )
            if my_orders:
                logger.info("MY INSTRUCTION: %s", my_orders)

            time.sleep(config.FUSION_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        camera.stop()
        audio.stop()
        rf.stop()
        broadcaster.stop()
        listener.stop()
        coordinator.stop()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    main()

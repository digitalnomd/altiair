# config.py — change NODE_ID on each device before running

NODE_ID = "node_1"  # "node_1" on laptop 1, "node_2" on laptop 2 / Jetson

NODES = {
    "node_1": "192.168.42.1",
    "node_2": "192.168.42.2",
}

MY_IP = NODES[NODE_ID]
GOSSIP_PORT = 5555
API_PORT = 8080
NODE_TIMEOUT = 3.0  # seconds of silence before declaring a node dead

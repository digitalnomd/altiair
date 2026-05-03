import { defaultDdilMeshTopology } from "../mesh/defaultTopology.js";
import type { MeshTopology, NodeDescriptor } from "../mesh/types.js";

interface Args {
  nodeId?: string;
  format: "json" | "env" | "wireguard" | "summary";
}

const args = parseArgs(process.argv.slice(2));
const topology = defaultDdilMeshTopology;
const node = args.nodeId === undefined ? undefined : findNode(topology, args.nodeId);

if (args.format === "json") {
  console.log(JSON.stringify(node ?? topology, null, 2));
} else if (args.format === "summary") {
  console.log(renderSummary(topology));
} else {
  if (node === undefined) {
    throw new Error(`--node is required when --format=${args.format}.`);
  }
  console.log(args.format === "env" ? renderEnv(node, topology) : renderWireGuard(node, topology));
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    format: "summary",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--node") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--node requires a node id.");
      }
      parsed.nodeId = value;
      index += 1;
    } else if (arg === "--format") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--format requires json, env, wireguard, or summary.");
      }
      if (!["json", "env", "wireguard", "summary"].includes(value)) {
        throw new Error(`Unsupported --format value: ${value}`);
      }
      parsed.format = value as Args["format"];
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function findNode(topology: MeshTopology, nodeId: string): NodeDescriptor {
  const node = topology.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) {
    const validIds = topology.nodes.map((candidate) => candidate.id).join(", ");
    throw new Error(`Unknown node "${nodeId}". Valid nodes: ${validIds}`);
  }
  return node;
}

function renderSummary(topology: MeshTopology): string {
  const rows = topology.nodes.map((node) =>
    [
      node.id.padEnd(16),
      node.platform.padEnd(18),
      node.lanAddress.padEnd(15),
      node.overlayAddress.padEnd(12),
      node.roles.join(","),
    ].join("  "),
  );

  return [
    `Mission network: ${topology.missionNetworkId}`,
    `Pi 5 mission LAN: ${topology.defaultApSsid ?? "Altiair-LAN"} on ${topology.defaultLanCidr}${
      topology.defaultGatewayAddress === undefined ? "" : ` via gateway ${topology.defaultGatewayAddress}`
    }`,
    `WireGuard overlay: ${topology.overlayCidr}`,
    "Pi 5 private AP is the default physical underlay; no external router, phone hotspot, or internet path is required.",
    "Pi 4B nodes join the Pi 5 AP; Jetson joins by Wi-Fi if available or Ethernet if needed.",
    "Field deployments can add drone, Hawkeye, vehicle, or operator-compute LAN cells under the same overlay.",
    "Loopback emulation proves the software contracts; it does not prove physical replication before node loss.",
    "",
    "Underlay cells:",
    ...topology.underlayCells.map(renderUnderlayCell),
    "",
    "Node              Platform            LAN              Overlay       Roles",
    "----              --------            ---              -------       -----",
    ...rows,
    "",
    "Generate per-node env:",
    "  npm run mesh:plan -- --node altiair-hub --format env",
    "",
    "Generate per-node WireGuard template without secrets:",
    "  npm run mesh:plan -- --node altiair-hub --format wireguard",
  ].join("\n");
}

function renderUnderlayCell(cell: MeshTopology["underlayCells"][number]): string {
  const host = cell.hostNodeId === undefined ? "deployment-selected host" : cell.hostNodeId;
  const address = cell.cidr === undefined
    ? ""
    : ` ${cell.cidr}${cell.gatewayAddress === undefined ? "" : ` via ${cell.gatewayAddress}`}`;
  return `- ${cell.id}: ${cell.role} hosted by ${host}${address}; ${cell.purpose}`;
}

function renderEnv(node: NodeDescriptor, topology: MeshTopology): string {
  return [
    `ALTIAIR_MISSION_NETWORK_ID=${topology.missionNetworkId}`,
    `ALTIAIR_AP_SSID=${topology.defaultApSsid ?? ""}`,
    `ALTIAIR_DEFAULT_LAN_CIDR=${topology.defaultLanCidr}`,
    `ALTIAIR_DEFAULT_GATEWAY_ADDRESS=${topology.defaultGatewayAddress ?? ""}`,
    `ALTIAIR_NODE_ID=${node.id}`,
    `ALTIAIR_HOSTNAME=${node.hostname}`,
    `ALTIAIR_PLATFORM=${node.platform}`,
    `ALTIAIR_ROLES=${node.roles.join(",")}`,
    `ALTIAIR_LAN_ADDRESS=${node.lanAddress}`,
    `ALTIAIR_OVERLAY_ADDRESS=${node.overlayAddress}`,
    `ALTIAIR_API_PORT=${node.apiPort}`,
    `ALTIAIR_WG_INTERFACE=wg0`,
    `ALTIAIR_WG_LISTEN_PORT=${node.wireGuardListenPort}`,
    `ALTIAIR_WG_PUBLIC_KEY_ENV=${node.publicKeyEnv}`,
    `ALTIAIR_PEER_IDS=${topology.nodes
      .filter((peer) => peer.id !== node.id)
      .map((peer) => peer.id)
      .join(",")}`,
    `ALTIAIR_MAX_BUNDLE_SIZE_BYTES=${topology.policy.maxBundleSizeBytes}`,
    `ALTIAIR_HIGH_WATER_QUEUE_DEPTH=${topology.policy.highWaterQueueDepth}`,
  ].join("\n");
}

function renderWireGuard(node: NodeDescriptor, topology: MeshTopology): string {
  const privateKeyEnv = node.publicKeyEnv.replace("_PUBLIC_KEY", "_PRIVATE_KEY");
  const peers = topology.nodes
    .filter((peer) => peer.id !== node.id)
    .map((peer) =>
      [
        "",
        `[Peer]`,
        `# ${peer.id} (${peer.hostname})`,
        `PublicKey = <${peer.publicKeyEnv}>`,
        `AllowedIPs = ${peer.overlayAddress}/32`,
        `Endpoint = ${peer.hostname}.local:${peer.wireGuardListenPort}`,
        `# Static/direct-LAN fallback: Endpoint = ${peer.lanAddress}:${peer.wireGuardListenPort}`,
        "# Enable only when peers cross NAT/firewall boundaries; LAN-only demos can omit it.",
        "PersistentKeepalive = 25",
      ].join("\n"),
    );

  return [
    "# Template only. Generate keys on each node with wg genkey; do not commit private keys.",
    "[Interface]",
    `Address = ${node.overlayAddress}/24`,
    `ListenPort = ${node.wireGuardListenPort}`,
    `PrivateKey = <${privateKeyEnv}>`,
    "",
    "# Keep the overlay route narrow so any direct or venue LAN remains directly reachable.",
    ...peers,
  ].join("\n");
}

function usage(): string {
  return [
    "Usage:",
    "  npm run mesh:plan -- [--format summary|json]",
    "  npm run mesh:plan -- --node altiair-hub --format env",
    "  npm run mesh:plan -- --node altiair-hub --format wireguard",
  ].join("\n");
}

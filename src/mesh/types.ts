export type NodePlatform =
  | "raspberry_pi_4b"
  | "raspberry_pi_5"
  | "jetson_orin_nano";

export type NodeRole =
  | "edge_sensor"
  | "mesh_hub"
  | "accelerated_inference"
  | "operator_display"
  | "foundry_gateway";

export type LinkClass =
  | "ethernet"
  | "wifi_ap"
  | "wireguard_overlay"
  | "usb_tether"
  | "unknown";

export type TransportLayer =
  | "closed_lan"
  | "wireguard_l3_overlay"
  | "http_json_api"
  | "store_forward_queue"
  | "nats_jetstream_optional"
  | "vendor_adapter_optional";

export type InteropBoundary =
  | "foundry_osdk"
  | "cjadc2_cop_optional"
  | "cot_xml_optional"
  | "lattice_style_entity_optional"
  | "atak_tak_server_optional";

export interface MeshPolicy {
  zeroTrust: boolean;
  allowAutonomousAction: false;
  allowTargetProsecution: false;
  requireHumanAcknowledgementForCues: true;
  externalSharePolicy: "policy_gate_required";
  maxClockSkewSeconds: number;
  maxBundleSizeBytes: number;
  highWaterQueueDepth: number;
}

export interface NodeCapability {
  name: string;
  detail: string;
}

export interface NodeDescriptor {
  id: string;
  hostname: string;
  platform: NodePlatform;
  roles: NodeRole[];
  lanAddress: string;
  overlayAddress: string;
  apiPort: number;
  wireGuardListenPort: number;
  publicKeyEnv: string;
  preferredLinks: LinkClass[];
  capabilities: NodeCapability[];
  constraints: string[];
  gatewayPriority: number;
}

export interface MeshTopology {
  missionNetworkId: string;
  overlayCidr: string;
  defaultLanCidr: string;
  travelRouterAddress: string;
  transports: TransportLayer[];
  interopBoundaries: InteropBoundary[];
  policy: MeshPolicy;
  nodes: NodeDescriptor[];
}

export interface PeerObservation {
  nodeId: string;
  online: boolean;
  lastSeenSeconds: number;
  linkClass: LinkClass;
  latencyMs: number;
  packetLoss: number;
  queueDepth: number;
  inFlightTransfers: number;
  cpuLoad: number;
  memoryPressure: number;
  internetReachable: boolean;
  foundryReachable: boolean;
  recentUploadSuccess: boolean;
  uplinkKbps: number;
  downlinkKbps: number;
}

export interface GatewayScore {
  nodeId: string;
  eligible: boolean;
  score: number;
  reasons: string[];
}

export interface GatewayDecision {
  selectedGatewayId: string | null;
  selectedGatewayScore: number;
  retainedCurrentGateway: boolean;
  scores: GatewayScore[];
  localOnly: boolean;
  decisionReason: string;
}

export interface CongestionDecision {
  acceptBundle: boolean;
  preferredDecision: "send_now" | "summarize_first" | "hold" | "drop_duplicate" | "review_policy";
  retryAfterSeconds: number | null;
  reasons: string[];
}

export interface MissionContinuityReport {
  status:
    | "nominal"
    | "degraded_one_node_failed"
    | "degraded_multi_node"
    | "local_only"
    | "offline";
  onlineNodeIds: string[];
  failedNodeIds: string[];
  selectedGatewayId: string | null;
  canContinueLocalFusion: boolean;
  canSyncExternal: boolean;
  missionNotes: string[];
}

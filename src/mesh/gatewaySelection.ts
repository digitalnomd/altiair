import type {
  CongestionDecision,
  GatewayDecision,
  GatewayScore,
  MeshTopology,
  MissionContinuityReport,
  NodeDescriptor,
  PeerObservation,
} from "./types.js";

export interface GatewaySelectionOptions {
  currentGatewayId?: string;
  hysteresisMargin: number;
  staleAfterSeconds: number;
}

const defaultGatewayOptions: GatewaySelectionOptions = {
  hysteresisMargin: 12,
  staleAfterSeconds: 30,
};

export function selectGateway(
  topology: MeshTopology,
  observations: PeerObservation[],
  options: Partial<GatewaySelectionOptions> = {},
): GatewayDecision {
  const resolvedOptions = { ...defaultGatewayOptions, ...options };
  const scores = topology.nodes
    .map((node) => scoreGatewayCandidate(node, observations, topology, resolvedOptions))
    .sort((left, right) => right.score - left.score);

  const best = scores.find((score) => score.eligible);
  if (best === undefined) {
    return {
      selectedGatewayId: null,
      selectedGatewayScore: 0,
      retainedCurrentGateway: false,
      scores,
      localOnly: true,
      decisionReason: "No eligible Foundry/CASK gateway is online; stay local and keep store-forward queues active.",
    };
  }

  const current = resolvedOptions.currentGatewayId === undefined
    ? undefined
    : scores.find((score) => score.nodeId === resolvedOptions.currentGatewayId);
  const retainCurrent =
    current !== undefined &&
    current.eligible &&
    best.nodeId !== current.nodeId &&
    best.score - current.score < resolvedOptions.hysteresisMargin;
  const selected = retainCurrent ? current : best;

  return {
    selectedGatewayId: selected.nodeId,
    selectedGatewayScore: selected.score,
    retainedCurrentGateway: retainCurrent,
    scores,
    localOnly: false,
    decisionReason: retainCurrent
      ? `Retained ${selected.nodeId}; the best alternative did not clear hysteresis.`
      : `Selected ${selected.nodeId} as the highest-scoring reachable CASK/Foundry gateway.`,
  };
}

export function scoreGatewayCandidate(
  node: NodeDescriptor,
  observations: PeerObservation[],
  topology: MeshTopology,
  options: GatewaySelectionOptions = defaultGatewayOptions,
): GatewayScore {
  const observation = observations.find((candidate) => candidate.nodeId === node.id);
  const reasons: string[] = [];

  if (observation === undefined) {
    return {
      nodeId: node.id,
      eligible: false,
      score: 0,
      reasons: ["No peer observation is available for this node."],
    };
  }

  if (!observation.online) {
    return {
      nodeId: node.id,
      eligible: false,
      score: 0,
      reasons: ["Node is offline."],
    };
  }

  if (observation.lastSeenSeconds > options.staleAfterSeconds) {
    return {
      nodeId: node.id,
      eligible: false,
      score: 0,
      reasons: [`Heartbeat is stale at ${observation.lastSeenSeconds}s.`],
    };
  }

  if (!node.roles.includes("foundry_gateway")) {
    return {
      nodeId: node.id,
      eligible: false,
      score: 0,
      reasons: ["Node is not configured as a Foundry/CASK gateway."],
    };
  }

  if (!observation.foundryReachable) {
    return {
      nodeId: node.id,
      eligible: false,
      score: 0,
      reasons: ["Foundry/CASK uplink is not reachable from this node."],
    };
  }

  let score = node.gatewayPriority;

  score += observation.foundryReachable ? 100 : 0;
  score += observation.internetReachable ? 35 : 0;
  score += observation.recentUploadSuccess ? 25 : 0;
  score += observation.uplinkKbps >= 5000 ? 12 : observation.uplinkKbps >= 1000 ? 6 : 0;
  score += observation.linkClass === "ethernet" ? 12 : 0;

  score -= Math.min(35, observation.latencyMs / 4);
  score -= Math.min(30, observation.packetLoss * 500);
  score -= Math.min(35, observation.queueDepth / 8);
  score -= Math.min(20, observation.inFlightTransfers * 2);
  score -= Math.max(0, observation.cpuLoad - 0.65) * 60;
  score -= Math.max(0, observation.memoryPressure - 0.75) * 80;

  if (observation.queueDepth >= topology.policy.highWaterQueueDepth) {
    score -= 40;
    reasons.push("Queue depth is above the high-water mark.");
  }

  if (observation.cpuLoad > 0.85) {
    reasons.push("CPU load is high; prefer a cooler gateway if available.");
  }

  if (observation.memoryPressure > 0.85) {
    reasons.push("Memory pressure is high; avoid routing new media through this gateway.");
  }

  if (observation.packetLoss > 0.05) {
    reasons.push("Packet loss is elevated.");
  }

  if (reasons.length === 0) {
    reasons.push("Reachable, fresh, and below congestion thresholds.");
  }

  return {
    nodeId: node.id,
    eligible: score > 0,
    score: Math.round(score * 10) / 10,
    reasons,
  };
}

export function decideCongestion(
  topology: MeshTopology,
  observation: PeerObservation,
  bundleSizeBytes: number,
  duplicateProbability: number,
  policyGate: "collect_only" | "review_needed" | "authorized_to_share" | "blocked",
): CongestionDecision {
  const reasons: string[] = [];
  let preferredDecision: CongestionDecision["preferredDecision"] = "send_now";

  if (policyGate === "blocked") {
    return {
      acceptBundle: false,
      preferredDecision: "review_policy",
      retryAfterSeconds: null,
      reasons: ["Policy gate is blocked; do not forward outside the local node."],
    };
  }

  if (policyGate !== "authorized_to_share") {
    preferredDecision = "review_policy";
    reasons.push("Policy gate has not authorized external sharing.");
  }

  if (duplicateProbability >= 0.92) {
    preferredDecision = "drop_duplicate";
    reasons.push("Bundle is very likely a duplicate; retain audit metadata only.");
  } else if (duplicateProbability >= 0.65) {
    preferredDecision = "summarize_first";
    reasons.push("Bundle may duplicate existing evidence; send compact metadata first.");
  }

  if (bundleSizeBytes > topology.policy.maxBundleSizeBytes) {
    preferredDecision = preferredDecision === "review_policy" ? "review_policy" : "summarize_first";
    reasons.push("Bundle exceeds max mesh payload size; use metadata, thumbnails, or clips first.");
  }

  if (observation.queueDepth >= topology.policy.highWaterQueueDepth) {
    preferredDecision = "hold";
    reasons.push("Gateway queue is above the high-water mark.");
  } else if (observation.queueDepth >= topology.policy.highWaterQueueDepth * 0.7) {
    preferredDecision = preferredDecision === "send_now" ? "summarize_first" : preferredDecision;
    reasons.push("Gateway queue is nearing the high-water mark.");
  }

  if (observation.cpuLoad > 0.9 || observation.memoryPressure > 0.9) {
    preferredDecision = "hold";
    reasons.push("Gateway compute pressure is critical.");
  }

  if (observation.packetLoss > 0.08 || observation.uplinkKbps < 384) {
    preferredDecision = preferredDecision === "send_now" ? "summarize_first" : preferredDecision;
    reasons.push("Link is degraded; avoid raw media transfer.");
  }

  return {
    acceptBundle: preferredDecision !== "drop_duplicate",
    preferredDecision,
    retryAfterSeconds: preferredDecision === "hold" ? 20 : null,
    reasons: reasons.length > 0 ? reasons : ["Gateway is below congestion thresholds."],
  };
}

export function assessMissionContinuity(
  topology: MeshTopology,
  observations: PeerObservation[],
  currentGatewayId?: string,
): MissionContinuityReport {
  const onlineNodeIds = observations
    .filter((observation) => observation.online)
    .map((observation) => observation.nodeId);
  const failedNodeIds = topology.nodes
    .filter((node) => !onlineNodeIds.includes(node.id))
    .map((node) => node.id);
  const onlineNodes = topology.nodes.filter((node) => onlineNodeIds.includes(node.id));
  const onlineSensors = onlineNodes.filter((node) => node.roles.includes("edge_sensor")).length;
  const onlineFusionNodes = onlineNodes.filter((node) =>
    node.roles.includes("mesh_hub") || node.roles.includes("accelerated_inference"),
  ).length;
  const gatewayDecision = selectGateway(topology, observations, { currentGatewayId });
  const canContinueLocalFusion = onlineSensors >= 1 && onlineFusionNodes >= 1;
  const canSyncExternal = gatewayDecision.selectedGatewayId !== null;
  const missionNotes: string[] = [];

  if (failedNodeIds.length > 0) {
    missionNotes.push(`Failed or unreachable nodes: ${failedNodeIds.join(", ")}.`);
  }
  if (!canSyncExternal) {
    missionNotes.push("No external gateway is available; keep local queue and reconcile later.");
  }
  if (canContinueLocalFusion) {
    missionNotes.push("Local evidence fusion can continue with remaining edge and fusion nodes.");
  } else {
    missionNotes.push("Local fusion path is not healthy; recover at least one sensor and one fusion node.");
  }

  let status: MissionContinuityReport["status"];
  if (!canContinueLocalFusion) {
    status = "offline";
  } else if (!canSyncExternal) {
    status = "local_only";
  } else if (failedNodeIds.length === 0) {
    status = "nominal";
  } else if (failedNodeIds.length === 1) {
    status = "degraded_one_node_failed";
  } else {
    status = "degraded_multi_node";
  }

  return {
    status,
    onlineNodeIds,
    failedNodeIds,
    selectedGatewayId: gatewayDecision.selectedGatewayId,
    canContinueLocalFusion,
    canSyncExternal,
    missionNotes,
  };
}

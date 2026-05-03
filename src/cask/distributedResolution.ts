import type { CaskBundle, PolicyState } from "./types.js";

export type PeerIntentRole =
  | "observe"
  | "move_to_viewpoint"
  | "confirm_tag"
  | "safety_observer"
  | "relay_display"
  | "hold";

export interface PeerIntent {
  role: PeerIntentRole;
  trackId: string;
  zoneId: string;
  exclusiveGroup: string;
  leaseExpiresAt: string;
  policyState: PolicyState;
}

export interface NodeResolutionContribution {
  nodeId: string;
  role: string;
  evidenceIds: string[];
  localConfidence: number;
  estimatedMetersToObjective: number;
  executionPositionScore: number;
  localReadout: string;
  whyInconclusiveAlone: string;
  peerIntent: PeerIntent;
  leasePriority: number;
  whyNeedsPeerPing: string;
}

export interface DistributedResolutionReport {
  scenarioId: string;
  candidateNodeIds: string[];
  minimumQuorumNodes: number;
  contributingNodeIds: string[];
  activeNodeIds: string[];
  missingNodeIds: string[];
  localResolutionThreshold: number;
  localActionThreshold: number;
  selectedNodeId?: string;
  selectedIntent?: PeerIntent;
  fusedConfidence: number;
  resolvedByQuorum: boolean;
  resolvedByPeerMesh: boolean;
  deconflicted: boolean;
  degraded: boolean;
  conclusion: string;
  quorumReasons: string[];
  coordinationReasons: string[];
  contributions: NodeResolutionContribution[];
}

export interface DistributedResolutionOptions {
  offlineNodeIds?: string[];
  now?: Date;
}

const CANDIDATE_NODE_IDS = [
  "altiair-node-a",
  "altiair-node-b",
  "altiair-orin",
  "altiair-hub",
];

const LOCAL_RESOLUTION_THRESHOLD = 0.7;
const LOCAL_ACTION_THRESHOLD = LOCAL_RESOLUTION_THRESHOLD;
const MINIMUM_QUORUM_NODES = 3;

export function buildDistributedResolutionReport(
  bundle: CaskBundle,
  options: DistributedResolutionOptions = {},
): DistributedResolutionReport {
  const now = options.now ?? new Date();
  const offlineNodeIds = new Set(options.offlineNodeIds ?? []);
  const contributions = buildContributions(bundle, offlineNodeIds, now);
  const activeContributions = contributions.filter((contribution) => contribution.evidenceIds.length > 0);
  const activeNodeIds = activeContributions.map((contribution) => contribution.nodeId);
  const contributingNodeIds = activeNodeIds;
  const missingNodeIds = CANDIDATE_NODE_IDS.filter((nodeId) => !activeNodeIds.includes(nodeId));
  const selectedContribution = selectActiveContribution(activeContributions);
  const allLocalReadoutsAreAmbiguous = contributions.every(
    (contribution) => contribution.localConfidence < LOCAL_RESOLUTION_THRESHOLD,
  );
  const quorumAvailable = activeNodeIds.length >= MINIMUM_QUORUM_NODES;
  const fusedConfidence = quorumAvailable && allLocalReadoutsAreAmbiguous
    ? quorumConfidenceFrom(bundle, activeNodeIds.length)
    : Math.min(0.58, fusedConfidenceFrom(bundle));
  const resolvedByQuorum = quorumAvailable &&
    allLocalReadoutsAreAmbiguous &&
    fusedConfidence >= LOCAL_RESOLUTION_THRESHOLD;
  const deconflicted = selectedContribution === undefined ||
    hasNoBlockingConflict(activeContributions, selectedContribution);
  const resolvedByPeerMesh = resolvedByQuorum && deconflicted;
  const reasons = [
    "RFID identity, audio cue, visual marker, and cached mission context live on different nodes.",
    "Every single-node readout remains below the resolution threshold.",
    "The fused cue crosses threshold through replicated peer evidence, not a single central authority.",
    "The Pi 5 may coordinate when online, but the Jetson or a Pi peer can take over the quorum role.",
    "The result remains a review cue with uncertainty and policy state, not an autonomous action.",
  ];

  return {
    scenarioId: bundle.missionId,
    candidateNodeIds: CANDIDATE_NODE_IDS,
    minimumQuorumNodes: MINIMUM_QUORUM_NODES,
    contributingNodeIds,
    activeNodeIds,
    missingNodeIds,
    localResolutionThreshold: LOCAL_RESOLUTION_THRESHOLD,
    localActionThreshold: LOCAL_ACTION_THRESHOLD,
    selectedNodeId: selectedContribution?.nodeId,
    selectedIntent: selectedContribution?.peerIntent,
    fusedConfidence,
    resolvedByQuorum,
    resolvedByPeerMesh,
    deconflicted,
    degraded: missingNodeIds.length > 0,
    conclusion:
      "Any surviving three-node quorum can fuse enough cross-node evidence to produce a policy-gated training cue.",
    quorumReasons: reasons,
    coordinationReasons: [
      ...reasons,
      "Each device publishes a signed intent ping so the surviving quorum can deconflict display, observation, safety, and tag-confirmation roles.",
      "Deterministic leases prevent two nodes from taking the same exclusive role at the same time.",
      "If the selected role owner fails after replication, its lease expires and the next strongest surviving quorum member carries on.",
    ],
    contributions,
  };
}

function buildContributions(
  bundle: CaskBundle,
  offlineNodeIds: Set<string>,
  now: Date,
): NodeResolutionContribution[] {
  const zoneId = bundle.locationFixes[0]?.zoneId ?? "training-zone-alpha";
  const policyState = bundle.counterUasCues[0]?.policyGate ?? "review_needed";

  return [
    {
      nodeId: "altiair-node-a",
      role: "Pi 4B RFID/local LLM track proposer",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-node-a", offlineNodeIds),
      localConfidence: 0.62,
      estimatedMetersToObjective: 5,
      executionPositionScore: positionScore(0.62, 5, 82),
      localReadout: "Tagged training subject or asset is near the checkpoint.",
      whyInconclusiveAlone: "RFID gives identity or presence, but not visual class, activity, or surrounding context.",
      peerIntent: intent("confirm_tag", zoneId, policyState, now),
      leasePriority: 82,
      whyNeedsPeerPing: "RFID can start a track, but peers need to know who is observing, moving, and confirming.",
    },
    {
      nodeId: "altiair-node-b",
      role: "Pi 4B audio/micro-observation local LLM",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-node-b", offlineNodeIds),
      localConfidence: 0.46,
      estimatedMetersToObjective: 24,
      executionPositionScore: positionScore(0.46, 24, 45),
      localReadout: "Audio signature or nearby activity is unusual in the same time window.",
      whyInconclusiveAlone: "Audio is ambiguous without identity, visual corroboration, and mission context.",
      peerIntent: intent("safety_observer", zoneId, policyState, now),
      leasePriority: 45,
      whyNeedsPeerPing: "Audio is useful support evidence and a safety check, but should not own the active track.",
    },
    {
      nodeId: "altiair-orin",
      role: "Jetson Orin Nano visual/local LLM track proposer",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-orin", offlineNodeIds),
      localConfidence: 0.57,
      estimatedMetersToObjective: 14,
      executionPositionScore: positionScore(0.57, 14, 88),
      localReadout: "Visual model sees a simulated aerial-object marker or relevant movement.",
      whyInconclusiveAlone: "Vision sees an object or marker, but cannot connect it to the RFID tag or policy gate.",
      peerIntent: intent("observe", zoneId, policyState, now),
      leasePriority: 88,
      whyNeedsPeerPing: "Vision can own the current observation lease, but peers need the lease to avoid duplicate movement.",
    },
    {
      nodeId: "altiair-hub",
      role: "Pi 5 display/local LLM coordinator candidate",
      evidenceIds: offlineNodeIds.has("altiair-hub")
        ? []
        : [
            ...bundle.counterUasCues.map((cue) => cue.id),
            ...bundle.controlSourceEstimates.map((estimate) => estimate.id),
          ],
      localConfidence: 0.52,
      estimatedMetersToObjective: 20,
      executionPositionScore: positionScore(0.52, 20, 70),
      localReadout: "Replicated mission ontology says the tag, zone, and event type are relevant to the training lane.",
      whyInconclusiveAlone: "Mission context is not a fresh observation until edge nodes provide evidence.",
      peerIntent: intent("relay_display", zoneId, policyState, now),
      leasePriority: 70,
      whyNeedsPeerPing: "Mission context needs fresh peer observations and should not become a single authority.",
    },
  ];
}

function intent(
  role: PeerIntentRole,
  zoneId: string,
  policyState: PolicyState,
  now: Date,
): PeerIntent {
  return {
    role,
    trackId: `track-${zoneId}`,
    zoneId,
    exclusiveGroup: `${role}:${zoneId}`,
    leaseExpiresAt: new Date(now.getTime() + 20_000).toISOString(),
    policyState,
  };
}

function evidenceIdsUnlessOffline(
  bundle: CaskBundle,
  nodeId: string,
  offlineNodeIds: Set<string>,
): string[] {
  return offlineNodeIds.has(nodeId) ? [] : idsForNode(bundle, nodeId);
}

function idsForNode(bundle: CaskBundle, nodeId: string): string[] {
  return [
    ...bundle.sensorEvents
      .filter((event) => event.sourceNodeId === nodeId)
      .map((event) => event.id),
    ...bundle.droneObservations
      .filter((observation) => observation.sourceNodeId === nodeId)
      .map((observation) => observation.id),
  ];
}

function selectActiveContribution(
  contributions: NodeResolutionContribution[],
): NodeResolutionContribution | undefined {
  return [...contributions]
    .sort((left, right) =>
      right.executionPositionScore - left.executionPositionScore ||
      left.estimatedMetersToObjective - right.estimatedMetersToObjective ||
      right.localConfidence - left.localConfidence ||
      left.nodeId.localeCompare(right.nodeId)
    )[0];
}

function positionScore(confidence: number, estimatedMetersToObjective: number, leasePriority: number): number {
  const proximityScore = Math.max(0, 100 - estimatedMetersToObjective * 4);
  return Math.round(proximityScore * 0.55 + confidence * 35 + leasePriority * 0.1);
}

function fusedConfidenceFrom(bundle: CaskBundle): number {
  const cueConfidence = bundle.counterUasCues[0]?.confidence;
  return typeof cueConfidence === "number" ? cueConfidence : 0.74;
}

function quorumConfidenceFrom(bundle: CaskBundle, contributingNodeCount: number): number {
  if (contributingNodeCount >= CANDIDATE_NODE_IDS.length) {
    return fusedConfidenceFrom(bundle);
  }
  return Math.min(fusedConfidenceFrom(bundle), 0.71);
}

function hasNoBlockingConflict(
  contributions: NodeResolutionContribution[],
  selectedContribution: NodeResolutionContribution,
): boolean {
  const selectedGroup = selectedContribution.peerIntent.exclusiveGroup;
  const conflictingOwners = contributions.filter(
    (contribution) =>
      contribution.nodeId !== selectedContribution.nodeId &&
      contribution.peerIntent.exclusiveGroup === selectedGroup &&
      contribution.leasePriority > selectedContribution.leasePriority,
  );
  return conflictingOwners.length === 0;
}

import type { InsightDraft } from "../cask/types.js";
import type { TrainingTagPlan } from "../cask/trainingTag.js";
import type { MeshTopology, NodeDescriptor, PeerObservation } from "./types.js";

export type CoordinatorAuthorityState =
  | "leader_active"
  | "no_quorum_observe_only";

export interface GossipWorldNode {
  nodeId: string;
  online: boolean;
  lastSeenSeconds: number;
  queueDepth: number;
  cpuLoad: number;
  roles: string[];
  latestEvidenceIds: string[];
}

export interface GossipWorldState {
  capturedAt: string;
  worldStateSource: "gossip_peer_state";
  onlineNodeIds: string[];
  failedNodeIds: string[];
  nodes: GossipWorldNode[];
}

export interface CoordinatorElection {
  algorithm: "raft_single_leader";
  term: number;
  quorumSize: number;
  votingNodeIds: string[];
  candidateNodeIds: string[];
  leaderId: string | null;
  authorityState: CoordinatorAuthorityState;
  thisNodeIsLeader: boolean;
  electionReason: string;
}

export interface CoordinatorDirective {
  id: string;
  createdAt: string;
  missionId: string;
  bundleId: string;
  coordinatorModel: string;
  coordinatorMode: string;
  election: CoordinatorElection;
  gossipWorld: GossipWorldState;
  recommendedNextAction: string;
  operatorNextAction: string;
  policyGate: string;
  instructions: Record<string, string>;
  rationale: string[];
  constraints: string[];
}

export interface BuildCoordinatorDirectiveOptions {
  localNodeId: string;
  previousLeaderId?: string;
  previousTerm?: number;
  previousIndex?: number;
  model: string;
  mode: string;
  createdAt?: Date;
}

export function buildGossipWorldState(
  topology: MeshTopology,
  observations: PeerObservation[],
  tagPlan?: TrainingTagPlan,
  createdAt: Date = new Date(),
): GossipWorldState {
  const evidenceByNode = new Map<string, string[]>();
  for (const assignment of tagPlan?.assignments ?? []) {
    const existing = evidenceByNode.get(assignment.nodeId) ?? [];
    evidenceByNode.set(assignment.nodeId, [...existing, ...assignment.evidenceIds]);
  }

  const nodes = topology.nodes.map((node) => {
    const observation = observations.find((candidate) => candidate.nodeId === node.id);
    return {
      nodeId: node.id,
      online: observation?.online ?? false,
      lastSeenSeconds: observation?.lastSeenSeconds ?? Number.POSITIVE_INFINITY,
      queueDepth: observation?.queueDepth ?? 0,
      cpuLoad: observation?.cpuLoad ?? 0,
      roles: node.roles,
      latestEvidenceIds: [...new Set(evidenceByNode.get(node.id) ?? [])],
    };
  });

  const onlineNodeIds = nodes.filter((node) => node.online).map((node) => node.nodeId);
  return {
    capturedAt: createdAt.toISOString(),
    worldStateSource: "gossip_peer_state",
    onlineNodeIds,
    failedNodeIds: nodes.filter((node) => !node.online).map((node) => node.nodeId),
    nodes,
  };
}

export function buildCoordinatorDirective(
  topology: MeshTopology,
  observations: PeerObservation[],
  bundleId: string,
  missionId: string,
  tagPlan: TrainingTagPlan,
  insight: InsightDraft | undefined,
  options: BuildCoordinatorDirectiveOptions,
): CoordinatorDirective {
  const createdAt = options.createdAt ?? new Date();
  const gossipWorld = buildGossipWorldState(topology, observations, tagPlan, createdAt);
  const election = electCoordinator(topology, observations, tagPlan, options.localNodeId, {
    previousLeaderId: options.previousLeaderId,
    previousTerm: options.previousTerm,
  });
  const instructions = buildCoordinatorInstructions(tagPlan, election, gossipWorld);
  const recommendedNextAction = recommendedAction(tagPlan, insight, election);
  const operatorNextAction = instructions[options.localNodeId] ??
    (election.authorityState === "leader_active"
      ? recommendedNextAction
      : "No Raft quorum for new coordinator authority; keep collecting and sharing local observations.");
  const nextIndex = (options.previousIndex ?? 0) + 1;

  return {
    id: `coord-${bundleId}-t${election.term}-i${nextIndex}`,
    createdAt: createdAt.toISOString(),
    missionId,
    bundleId,
    coordinatorModel: options.model,
    coordinatorMode: options.mode,
    election,
    gossipWorld,
    recommendedNextAction,
    operatorNextAction,
    policyGate: tagPlan.policyGate,
    instructions,
    rationale: [
      election.electionReason,
      "Gossip supplies the current world state; Raft supplies the single coordinator authority.",
      "Every node may locally fuse sensor evidence, but only the elected leader publishes coordinator instructions.",
      ...(insight === undefined ? [] : [`Latest local insight: ${insight.summary}`]),
    ],
    constraints: [
      "Verification, observation, relay, deconfliction, and human review only.",
      "No target prosecution, engagement, pursuit, capture, restraint, harm, or autonomous action.",
      "Reject stale coordinator outputs from older terms or non-leader nodes.",
    ],
  };
}

function electCoordinator(
  topology: MeshTopology,
  observations: PeerObservation[],
  tagPlan: TrainingTagPlan,
  localNodeId: string,
  options: { previousLeaderId?: string; previousTerm?: number },
): CoordinatorElection {
  const quorumSize = Math.floor(topology.nodes.length / 2) + 1;
  const votingNodeIds = observations
    .filter((observation) => observation.online)
    .map((observation) => observation.nodeId)
    .filter((nodeId) => topology.nodes.some((node) => node.id === nodeId))
    .sort();
  const candidates = topology.nodes
    .filter((node) => votingNodeIds.includes(node.id))
    .filter(hasCoordinatorCapability)
    .sort((left, right) => coordinatorScore(right, observations, tagPlan) - coordinatorScore(left, observations, tagPlan) ||
      left.id.localeCompare(right.id));

  if (votingNodeIds.length < quorumSize || candidates.length === 0) {
    return {
      algorithm: "raft_single_leader",
      term: options.previousTerm ?? 0,
      quorumSize,
      votingNodeIds,
      candidateNodeIds: candidates.map((node) => node.id),
      leaderId: null,
      authorityState: "no_quorum_observe_only",
      thisNodeIsLeader: false,
      electionReason: `No coordinator elected: ${votingNodeIds.length}/${topology.nodes.length} voting nodes online; quorum requires ${quorumSize}. Continue scoring candidates by connectivity, load, and position when quorum returns.`,
    };
  }

  const retainedLeader = options.previousLeaderId === undefined
    ? undefined
    : candidates.find((candidate) => candidate.id === options.previousLeaderId);
  const leader = retainedLeader ?? candidates[0]!;
  const previousTerm = options.previousTerm ?? 0;
  const term = retainedLeader === undefined && options.previousLeaderId !== leader.id
    ? previousTerm + 1
    : Math.max(1, previousTerm);

  return {
    algorithm: "raft_single_leader",
    term,
    quorumSize,
    votingNodeIds,
    candidateNodeIds: candidates.map((node) => node.id),
    leaderId: leader.id,
    authorityState: "leader_active",
    thisNodeIsLeader: leader.id === localNodeId,
    electionReason: retainedLeader === undefined
      ? `Elected ${leader.id} as the single coordinator LLM leader for term ${term} using connectivity, load, role, and current task-position scoring.`
      : `Retained ${leader.id} as the single coordinator LLM leader for term ${term}; it remains the best connected or positioned viable candidate.`,
  };
}

function hasCoordinatorCapability(node: NodeDescriptor): boolean {
  return node.capabilities.some((capability) => capability.name === "local_llm") ||
    node.roles.includes("mesh_hub") ||
    node.roles.includes("accelerated_inference") ||
    node.roles.includes("operator_display") ||
    node.roles.includes("edge_sensor");
}

function coordinatorScore(node: NodeDescriptor, observations: PeerObservation[], tagPlan: TrainingTagPlan): number {
  const observation = observations.find((candidate) => candidate.nodeId === node.id);
  if (observation === undefined || !observation.online) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  score += node.roles.includes("mesh_hub") ? 50 : 0;
  score += node.roles.includes("accelerated_inference") ? 42 : 0;
  score += node.roles.includes("operator_display") ? 18 : 0;
  score += node.roles.includes("foundry_gateway") ? 12 : 0;
  score += node.capabilities.some((capability) => capability.name === "local_llm") ? 20 : 0;
  score += observation.linkClass === "ethernet" ? 8 : 0;
  score += taskPositionScore(node.id, tagPlan);
  score -= observation.queueDepth / 10;
  score -= Math.max(0, observation.cpuLoad - 0.7) * 50;
  score -= Math.max(0, observation.memoryPressure - 0.75) * 50;
  score -= observation.packetLoss * 200;
  score -= observation.lastSeenSeconds;
  return score;
}

function taskPositionScore(nodeId: string, tagPlan: TrainingTagPlan): number {
  const assignments = tagPlan.assignments.filter((assignment) => assignment.nodeId === nodeId);
  const evidenceCount = new Set(assignments.flatMap((assignment) => assignment.evidenceIds)).size;
  let score = Math.min(evidenceCount * 2, 12);
  if (tagPlan.selectedNodeId === nodeId) {
    score += 14;
  }
  if (assignments.some((assignment) => assignment.role === "relay_display")) {
    score += 8;
  }
  if (assignments.some((assignment) => assignment.role === "observe")) {
    score += 4;
  }
  return score;
}

function buildCoordinatorInstructions(
  tagPlan: TrainingTagPlan,
  election: CoordinatorElection,
  gossipWorld: GossipWorldState,
): Record<string, string> {
  if (election.authorityState !== "leader_active") {
    return Object.fromEntries(gossipWorld.onlineNodeIds.map((nodeId) => [
      nodeId,
      "Observe, preserve local evidence, and continue gossip; do not accept new coordinator instructions until Raft quorum returns.",
    ]));
  }

  const instructions: Record<string, string> = {};
  for (const assignment of tagPlan.assignments) {
    if (!gossipWorld.onlineNodeIds.includes(assignment.nodeId)) {
      continue;
    }
    instructions[assignment.nodeId] = assignment.instruction;
  }

  for (const nodeId of gossipWorld.onlineNodeIds) {
    instructions[nodeId] ??= "Continue local sensing, relay gossip state, and preserve replicated CASK records.";
  }

  return instructions;
}

function recommendedAction(
  tagPlan: TrainingTagPlan,
  insight: InsightDraft | undefined,
  election: CoordinatorElection,
): string {
  if (election.authorityState !== "leader_active") {
    return "Hold new coordination decisions; continue local sensing and gossip until Raft quorum returns.";
  }
  if (tagPlan.executionState === "ready_for_non_contact_tag") {
    return "Proceed only with the authorized non-contact training tag confirmation and keep policy state visible.";
  }
  if (tagPlan.executionState === "awaiting_operator_authorization") {
    return "Keep the cue in human review; stage observation, relay, safety, and confirmation roles without contact.";
  }
  return insight?.recommendedNextChecks[0] ??
    "Collect another independent sensor observation before issuing coordinator instructions.";
}

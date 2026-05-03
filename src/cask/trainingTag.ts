import type { CaskBundle, PolicyState } from "./types.js";
import type { DistributedResolutionReport, NodeResolutionContribution } from "./distributedResolution.js";

export type TrainingTagMethod =
  | "rfid_nfc_scan"
  | "qr_scan"
  | "ble_beacon_nearby"
  | "manual_referee_ack";

export type TrainingTagRole =
  | "observe"
  | "guide_to_checkpoint"
  | "confirm_tag"
  | "safety_observer"
  | "relay_display";

export type TrainingTagExecutionState =
  | "blocked"
  | "below_quorum_collect_more"
  | "awaiting_operator_authorization"
  | "ready_for_non_contact_tag";

export interface TrainingTagOptions {
  operatorAuthorized?: boolean;
  tagMethod?: TrainingTagMethod;
}

export interface TrainingTagAssignment {
  nodeId: string;
  role: TrainingTagRole;
  evidenceIds: string[];
  instruction: string;
  fallbackNodeIds: string[];
}

export interface TrainingTagPlan {
  objectiveId: string;
  objectiveType: "controlled_training_tag";
  subjectRef: string;
  authorizedZoneId: string;
  tagMethod: TrainingTagMethod;
  policyGate: PolicyState;
  operatorAuthorized: boolean;
  nonContactOnly: true;
  resolvedByPeerMesh: boolean;
  selectedNodeId?: string;
  degraded: boolean;
  executionState: TrainingTagExecutionState;
  assignments: TrainingTagAssignment[];
  prohibitedActions: string[];
}

export function buildTrainingTagPlan(
  bundle: CaskBundle,
  resolution: DistributedResolutionReport,
  options: TrainingTagOptions = {},
): TrainingTagPlan {
  const operatorAuthorized = options.operatorAuthorized ?? false;
  const policyGate = bundle.counterUasCues[0]?.policyGate ?? "review_needed";
  const executionState = decideExecutionState(policyGate, resolution.resolvedByPeerMesh, operatorAuthorized);
  const activeContributions = resolution.contributions.filter(
    (contribution) => contribution.evidenceIds.length > 0,
  );

  return {
    objectiveId: `tag-${bundle.id}`,
    objectiveType: "controlled_training_tag",
    subjectRef: subjectRefFrom(bundle),
    authorizedZoneId: bundle.locationFixes[0]?.zoneId ?? "training-zone-alpha",
    tagMethod: options.tagMethod ?? "rfid_nfc_scan",
    policyGate,
    operatorAuthorized,
    nonContactOnly: true,
    resolvedByPeerMesh: resolution.resolvedByPeerMesh,
    selectedNodeId: resolution.selectedNodeId,
    degraded: resolution.degraded,
    executionState,
    assignments: buildAssignments(
      activeContributions,
      resolution.selectedNodeId,
      executionState === "ready_for_non_contact_tag",
    ),
    prohibitedActions: [
      "No harm, capture, restraint, pursuit, or physical contact.",
      "No autonomous drone or robot contact with a person.",
      "No escalation beyond the authorized training zone.",
      "No raw media sharing outside the local mesh unless policy allows it.",
    ],
  };
}

function decideExecutionState(
  policyGate: PolicyState,
  resolvedByPeerMesh: boolean,
  operatorAuthorized: boolean,
): TrainingTagExecutionState {
  if (policyGate === "blocked") {
    return "blocked";
  }
  if (!resolvedByPeerMesh) {
    return "below_quorum_collect_more";
  }
  if (!operatorAuthorized || policyGate !== "authorized_to_share") {
    return "awaiting_operator_authorization";
  }
  return "ready_for_non_contact_tag";
}

function buildAssignments(
  contributions: NodeResolutionContribution[],
  selectedNodeId: string | undefined,
  readyForTag: boolean,
): TrainingTagAssignment[] {
  const firstContribution = contributions[0];
  if (firstContribution === undefined) {
    return [];
  }

  const nodeIds = contributions.map((contribution) => contribution.nodeId);
  const selectedNode = contributions.find((contribution) => contribution.nodeId === selectedNodeId) ?? firstContribution;
  const visualNode = findContribution(contributions, "visual") ?? contributions[1] ?? firstContribution;
  const contextNode = findContribution(contributions, "context") ?? selectedNode;
  const audioNode = findContribution(contributions, "audio") ?? contributions[2] ?? firstContribution;

  return [
    assignment(
      visualNode,
      "observe",
      readyForTag
        ? "Maintain observation of the authorized training cue and report confidence, uncertainty, and zone changes."
        : "Stage observation coverage and wait for operator authorization before tag confirmation.",
      nodeIds,
    ),
    assignment(
      selectedNode,
      "guide_to_checkpoint",
      readyForTag
        ? "Move to the assigned observation/tag checkpoint for the authorized training zone; do not chase or make contact."
        : "Prepare the assigned observation/tag checkpoint, but do not move until the operator authorizes the tag objective.",
      nodeIds,
    ),
    assignment(
      selectedNode,
      "confirm_tag",
      readyForTag
        ? "Confirm the tag with NFC/RFID/QR/manual acknowledgement."
        : "Stand by for NFC/RFID/QR/manual tag confirmation; do not confirm until operator authorization.",
      nodeIds,
    ),
    assignment(
      audioNode,
      "safety_observer",
      "Watch for zone boundary, bystander, or policy conflicts and hold the tag objective if anything is ambiguous.",
      nodeIds,
    ),
    assignment(
      contextNode,
      "relay_display",
      "Update the shared display with tag status, evidence IDs, missing nodes, and policy gate.",
      nodeIds,
    ),
  ];
}

function assignment(
  contribution: NodeResolutionContribution,
  role: TrainingTagRole,
  instruction: string,
  nodeIds: string[],
): TrainingTagAssignment {
  return {
    nodeId: contribution.nodeId,
    role,
    evidenceIds: contribution.evidenceIds,
    instruction,
    fallbackNodeIds: nodeIds.filter((nodeId) => nodeId !== contribution.nodeId),
  };
}

function findContribution(
  contributions: NodeResolutionContribution[],
  kind: "rfid" | "audio" | "visual" | "context",
): NodeResolutionContribution | undefined {
  return contributions.find((contribution) => {
    const haystack = `${contribution.role} ${contribution.evidenceIds.join(" ")}`.toLowerCase();
    return haystack.includes(kind) ||
      (kind === "visual" && haystack.includes("jetson")) ||
      (kind === "context" && haystack.includes("cask"));
  });
}

function subjectRefFrom(bundle: CaskBundle): string {
  const locationEntity = bundle.locationFixes[0]?.entityId;
  if (locationEntity !== undefined) {
    return locationEntity;
  }
  const rfidEvent = bundle.sensorEvents.find((event) => event.kind === "rfid");
  return rfidEvent?.id ?? "training-subject";
}

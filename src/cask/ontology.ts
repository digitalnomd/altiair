export type CaskFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "timestamp"
  | "json"
  | "string_array";

export interface CaskOntologyField {
  name: string;
  kind: CaskFieldKind;
  required: boolean;
  description: string;
}

export interface CaskOntologyObjectType {
  apiName: string;
  displayName: string;
  primaryKey: string;
  description: string;
  fields: CaskOntologyField[];
}

export interface CaskOntologyLinkType {
  apiName: string;
  displayName: string;
  fromObject: string;
  toObject: string;
  description: string;
}

export interface CaskOntologyActionType {
  apiName: string;
  displayName: string;
  objectType: string;
  purpose: string;
}

export interface CaskOntologyShape {
  ontologyName: "CASK";
  objectTypes: CaskOntologyObjectType[];
  linkTypes: CaskOntologyLinkType[];
  actionTypes: CaskOntologyActionType[];
}

const sharedRecordFields: CaskOntologyField[] = [
  field("missionId", "string", true, "Mission or exercise identifier shared across the local mesh and Foundry."),
  field("sourceNodeId", "string", true, "Altiair node that created the record."),
  field("observedAt", "timestamp", true, "Sensor or local runtime observation time."),
  field("confidence", "number", true, "Normalized confidence from 0 to 1."),
  field("policyState", "string", true, "collect_only, review_needed, authorized_to_share, or blocked."),
  field("supportingEvidenceIds", "string_array", false, "Local CASK record IDs supporting this object."),
];

export const caskOntologyShape: CaskOntologyShape = {
  ontologyName: "CASK",
  objectTypes: [
    {
      apiName: "CaskMission",
      displayName: "CASK Mission",
      primaryKey: "missionId",
      description: "Top-level mission or exercise context replicated locally and reconciled with Foundry.",
      fields: [
        field("missionId", "string", true, "Stable mission identifier."),
        field("name", "string", false, "Operator-facing mission name."),
        field("policyState", "string", true, "Mission-wide sharing and review state."),
        field("createdAt", "timestamp", true, "Mission creation time."),
      ],
    },
    {
      apiName: "CaskMissionInstruction",
      displayName: "CASK Mission Instruction",
      primaryKey: "instructionId",
      description: "Operator-provided mission instruction packet that seeds local deployment, policy checks, and node leases.",
      fields: [
        field("instructionId", "string", true, "Stable local instruction ID."),
        field("missionId", "string", true, "Mission identifier."),
        field("title", "string", true, "Operator-facing instruction title."),
        field("missionText", "string", true, "Original instruction text after local validation."),
        field("objectiveType", "string", true, "controlled_training_tag, counter_uas_review, or mesh_resilience_drill."),
        field("authorizedZoneId", "string", true, "Authorized training zone for the deployment."),
        field("subjectRef", "string", true, "Tagged training subject, asset, or controlled object reference."),
        field("requiredSensorKinds", "string_array", true, "rfid, audio, camera, and node_health requirements."),
        field("operatorAuthorized", "boolean", true, "Whether a human operator marked the instruction authorized for deployment."),
        field("requestedBy", "string", true, "Requester or project lead recorded on the instruction."),
        field("policyState", "string", true, "Instruction policy state."),
        field("constraints", "string_array", true, "Safety and policy constraints attached to this instruction."),
        field("createdAt", "timestamp", true, "Instruction creation time."),
      ],
    },
    {
      apiName: "CaskPolicyDecision",
      displayName: "CASK Policy Decision",
      primaryKey: "policyDecisionId",
      description: "Local policy decision for deploying mission instructions and sharing the resulting CASK records.",
      fields: [
        field("policyDecisionId", "string", true, "Stable policy decision ID."),
        field("instructionId", "string", true, "Linked mission instruction."),
        field("missionId", "string", true, "Mission identifier."),
        field("policyState", "string", true, "authorized_to_share, review_needed, collect_only, or blocked."),
        field("deployable", "boolean", true, "Whether the local runtime may activate node leases."),
        field("requiresHumanReview", "boolean", true, "Whether human review remains required."),
        field("blockedReasons", "string_array", true, "Policy reasons blocking deployment."),
        field("reviewReasons", "string_array", true, "Policy reasons needing operator review."),
        field("allowedActions", "string_array", true, "Allowed local evidence and coordination actions."),
        field("rejectedActions", "string_array", true, "Rejected actions that the runtime must not emit."),
        field("decidedAt", "timestamp", true, "Policy decision time."),
      ],
    },
    {
      apiName: "CaskDeploymentOrder",
      displayName: "CASK Deployment Order",
      primaryKey: "deploymentId",
      description: "Policy-gated deployment order that maps a mission instruction onto Pi/Jetson node leases.",
      fields: [
        field("deploymentId", "string", true, "Stable local deployment ID."),
        field("instructionId", "string", true, "Source mission instruction."),
        field("missionId", "string", true, "Mission identifier."),
        field("title", "string", true, "Operator-facing deployment title."),
        field("state", "string", true, "deployable, deployed, or blocked."),
        field("objectiveType", "string", true, "Deployment objective type."),
        field("authorizedZoneId", "string", true, "Authorized training zone."),
        field("subjectRef", "string", true, "Tagged training subject, asset, or controlled object reference."),
        field("deployable", "boolean", true, "Whether the deployment may activate locally."),
        field("requiresHumanReview", "boolean", true, "Whether human review remains required."),
        field("blockedReasons", "string_array", true, "Policy reasons blocking deployment."),
        field("operatorSummary", "string", true, "Concise operator-visible summary."),
        field("startupSequence", "string_array", true, "Node startup commands for the local runtime."),
        field("payloadJson", "json", true, "Node leases, timeline, and queued Foundry action plan."),
        field("createdAt", "timestamp", true, "Deployment order creation time."),
        field("deployedAt", "timestamp", false, "Deployment activation time."),
      ],
    },
    {
      apiName: "CaskNodeLease",
      displayName: "CASK Node Lease",
      primaryKey: "leaseId",
      description: "Short-lived role lease assigning a Pi/Jetson node to sensing, relay, display, gateway, or coordinator-candidate duties.",
      fields: [
        field("leaseId", "string", true, "Stable lease ID."),
        field("deploymentId", "string", true, "Parent deployment order."),
        field("nodeId", "string", true, "Assigned edge node."),
        field("hostname", "string", true, "Node hostname."),
        field("roles", "string_array", true, "Lease roles assigned to the node."),
        field("state", "string", true, "assigned, standby, or blocked."),
        field("priority", "number", true, "Lease priority for display and takeover."),
        field("apiBaseUrl", "string", true, "Node API base URL."),
        field("startupCommand", "string", true, "Node-local startup command."),
        field("instruction", "string", true, "Policy-bounded node instruction."),
        field("fallbackNodeIds", "string_array", true, "Nodes that can assume this lease if needed."),
        field("sensorEventKinds", "string_array", true, "Sensor event kinds this node should post."),
        field("requiredEndpoints", "string_array", true, "Node API endpoints required by the frontend and mesh."),
        field("policyState", "string", true, "Policy state copied from the instruction."),
        field("assignedAt", "timestamp", true, "Lease assignment time."),
        field("leaseExpiresAt", "timestamp", true, "Lease expiry time."),
      ],
    },
    {
      apiName: "CaskMissionTimelineEvent",
      displayName: "CASK Mission Timeline Event",
      primaryKey: "timelineEventId",
      description: "Auditable mission timeline event for instruction receipt, policy checks, node lease assignment, and deployment activation.",
      fields: [
        field("timelineEventId", "string", true, "Stable timeline event ID."),
        field("deploymentId", "string", true, "Parent deployment order."),
        field("missionId", "string", true, "Mission identifier."),
        field("eventType", "string", true, "instruction_received, policy_checked, node_lease_assigned, deployment_activated, or deployment_blocked."),
        field("nodeId", "string", false, "Associated node when the event is node-specific."),
        field("summary", "string", true, "Operator-facing event summary."),
        field("payloadJson", "json", false, "Typed event payload for audit and replay."),
        field("occurredAt", "timestamp", true, "Event time."),
      ],
    },
    {
      apiName: "CaskEdgeNode",
      displayName: "CASK Edge Node",
      primaryKey: "nodeId",
      description: "Pi, Jetson, or display node participating in the local CASK edge mesh.",
      fields: [
        field("nodeId", "string", true, "Stable Altiair node identifier."),
        field("hostname", "string", true, "Device hostname."),
        field("platform", "string", true, "raspberry_pi_4b, raspberry_pi_5, or jetson_orin_nano."),
        field("roles", "string_array", true, "Configured node roles."),
        field("overlayAddress", "string", true, "WireGuard or local overlay address."),
      ],
    },
    {
      apiName: "CaskSensorObservation",
      displayName: "CASK Sensor Observation",
      primaryKey: "observationId",
      description: "Normalized camera, microphone, RFID, or provider-style location observation.",
      fields: [
        field("observationId", "string", true, "Local sensor event ID."),
        ...sharedRecordFields,
        field("kind", "string", true, "camera, audio, rfid, or provider_style_location."),
        field("zoneId", "string", false, "Authorized training zone or coarse operational area."),
        field("payloadJson", "json", true, "Typed local event payload."),
      ],
    },
    {
      apiName: "CaskLocationFix",
      displayName: "CASK Location Fix",
      primaryKey: "fixId",
      description: "Coarse location fix derived from RFID/provider-style location or other allowed sensors.",
      fields: [
        field("fixId", "string", true, "Local location-fix ID."),
        ...sharedRecordFields,
        field("entityId", "string", true, "Pseudonymous tag, asset, or subject reference."),
        field("sourceType", "string", true, "rfid, rfid_provider_style, camera, audio, or manual."),
        field("zoneId", "string", false, "Coarse zone for the fix."),
        field("latitude", "number", false, "Latitude when policy and source allow coordinates."),
        field("longitude", "number", false, "Longitude when policy and source allow coordinates."),
        field("precisionRadiusMeters", "number", true, "Uncertainty radius. RFID kit data remains coarse."),
        field("expiresAt", "timestamp", true, "Freshness expiry for the fix."),
        field("isCarrierGrade", "boolean", true, "False for Arduino/RFID-kit mock provider data."),
      ],
    },
    {
      apiName: "CaskUasObservation",
      displayName: "CASK UAS Observation",
      primaryKey: "uasObservationId",
      description: "Drone-class observation produced by camera inference or policy-allowed imported context.",
      fields: [
        field("uasObservationId", "string", true, "Local drone observation ID."),
        ...sharedRecordFields,
        field("droneClass", "string", true, "commercial_quadcopter, low_cost_one_way, decoy, or unknown."),
        field("zoneId", "string", false, "Coarse observation zone."),
        field("mediaRef", "string", false, "Policy-allowed local media reference, thumbnail, or hash."),
      ],
    },
    {
      apiName: "CaskControlSourceEstimate",
      displayName: "CASK Control Source Estimate",
      primaryKey: "estimateId",
      description: "Evidence-backed estimate that correlates UAS observations with coarse RFID/location context.",
      fields: [
        field("estimateId", "string", true, "Local estimate ID."),
        field("missionId", "string", true, "Mission identifier."),
        field("estimatedZoneId", "string", false, "Coarse estimated zone."),
        field("confidenceRingMeters", "number", true, "Uncertainty radius for the estimate."),
        field("confidence", "number", true, "Normalized confidence from 0 to 1."),
        field("freshnessSeconds", "number", true, "Age of the strongest location evidence."),
        field("policyState", "string", true, "Policy gate for using or sharing the estimate."),
        field("supportingEvidenceIds", "string_array", true, "Evidence IDs used by the estimate."),
        field("contradictingEvidenceIds", "string_array", true, "Evidence IDs that weaken or contradict the estimate."),
      ],
    },
    {
      apiName: "CaskCounterUasCue",
      displayName: "CASK Counter-UAS Cue",
      primaryKey: "cueId",
      description: "Policy-gated cue for human review, verification, and local mesh display.",
      fields: [
        field("cueId", "string", true, "Local cue ID."),
        field("missionId", "string", true, "Mission identifier."),
        field("controlSourceEstimateId", "string", false, "Linked estimate, if available."),
        field("confidence", "number", true, "Normalized cue confidence."),
        field("policyGate", "string", true, "collect_only, review_needed, authorized_to_share, or blocked."),
        field("acknowledgementState", "string", true, "queued, seen, acknowledged, or closed."),
        field("recommendedNextChecks", "string_array", true, "Verification and deconfliction checks only."),
        field("createdAt", "timestamp", true, "Cue creation time."),
        field("updatedAt", "timestamp", true, "Cue update time."),
      ],
    },
    {
      apiName: "CaskTagObjective",
      displayName: "CASK Training Tag Objective",
      primaryKey: "objectiveId",
      description: "Non-contact training tag objective derived from replicated evidence and policy gates.",
      fields: [
        field("objectiveId", "string", true, "Local tag objective ID."),
        field("subjectRef", "string", true, "Pseudonymous tag or subject reference."),
        field("authorizedZoneId", "string", true, "Zone where non-contact tagging is authorized."),
        field("executionState", "string", true, "blocked, below_quorum_collect_more, awaiting_operator_authorization, or ready_for_non_contact_tag."),
        field("policyGate", "string", true, "Current policy gate."),
        field("operatorAuthorized", "boolean", true, "Whether a human operator authorized the tag objective."),
        field("nonContactOnly", "boolean", true, "Always true for this demo path."),
      ],
    },
    {
      apiName: "CaskNodeInstruction",
      displayName: "CASK Node Instruction",
      primaryKey: "instructionId",
      description: "Per-node local instruction produced from the tag plan for display on each Pi/client.",
      fields: [
        field("instructionId", "string", true, "Stable instruction ID."),
        field("objectiveId", "string", true, "Linked CASK training tag objective."),
        field("nodeId", "string", true, "Assigned node."),
        field("role", "string", true, "observe, guide_to_checkpoint, confirm_tag, safety_observer, or relay_display."),
        field("instruction", "string", true, "Policy-bounded local instruction."),
        field("fallbackNodeIds", "string_array", true, "Nodes that can take over if this node fails."),
        field("evidenceIds", "string_array", true, "Evidence IDs shown to the operator."),
      ],
    },
    {
      apiName: "CaskGossipWorldState",
      displayName: "CASK Gossip World State",
      primaryKey: "gossipStateId",
      description: "Gossip-derived shared awareness snapshot used by the elected coordinator.",
      fields: [
        field("gossipStateId", "string", true, "Stable gossip snapshot ID."),
        field("missionId", "string", true, "Mission identifier."),
        field("capturedAt", "timestamp", true, "Snapshot capture time."),
        field("onlineNodeIds", "string_array", true, "Nodes currently reachable by gossip/heartbeat."),
        field("failedNodeIds", "string_array", true, "Nodes currently missing or failed."),
        field("payloadJson", "json", true, "Per-node fused state, evidence IDs, and health details."),
      ],
    },
    {
      apiName: "CaskCoordinatorDirective",
      displayName: "CASK Coordinator Directive",
      primaryKey: "directiveId",
      description: "Singleton Raft-term coordinator output produced by exactly one elected coordinator LLM.",
      fields: [
        field("directiveId", "string", true, "Stable coordinator directive ID."),
        field("missionId", "string", true, "Mission identifier."),
        field("bundleId", "string", true, "Source bundle ID."),
        field("leaderNodeId", "string", false, "Raft leader node allowed to publish this directive."),
        field("term", "number", true, "Raft coordinator term."),
        field("authorityState", "string", true, "leader_active or no_quorum_observe_only."),
        field("coordinatorModel", "string", true, "Local model or deterministic fallback profile."),
        field("recommendedNextAction", "string", true, "Policy-bounded overall coordinator recommendation."),
        field("operatorNextAction", "string", true, "Instruction for this display/operator node."),
        field("policyGate", "string", true, "Policy gate copied from the cue/tag plan."),
        field("instructionsJson", "json", true, "Per-node instructions keyed by node ID."),
        field("createdAt", "timestamp", true, "Directive creation time."),
      ],
    },
    {
      apiName: "CaskInsightDraft",
      displayName: "CASK Insight Draft",
      primaryKey: "insightId",
      description: "Node-local LLM draft with citations, limitations, and policy state.",
      fields: [
        field("insightId", "string", true, "Local insight ID."),
        field("bundleId", "string", true, "Source bundle ID."),
        field("model", "string", true, "Local model name."),
        field("summary", "string", true, "Evidence-grounded summary."),
        field("confidence", "number", true, "Normalized confidence from 0 to 1."),
        field("limitations", "string_array", true, "Known limitations and uncertainty."),
        field("evidenceIds", "string_array", true, "Evidence IDs cited by the insight."),
        field("recommendedNextChecks", "string_array", true, "Verification and deconfliction checks only."),
        field("policyState", "string", true, "Policy state for the draft."),
        field("createdAt", "timestamp", true, "Draft creation time."),
      ],
    },
    {
      apiName: "CaskNodeHealth",
      displayName: "CASK Node Health",
      primaryKey: "nodeHealthId",
      description: "Runtime health for Pi and Jetson nodes, including local model status.",
      fields: [
        field("nodeHealthId", "string", true, "Stable health record ID."),
        field("nodeId", "string", true, "Altiair node identifier."),
        field("nodeRole", "string", true, "pi4_edge, pi5_hub, jetson_orin_inference, or operator_display."),
        field("observedAt", "timestamp", true, "Health observation time."),
        field("peerCount", "number", true, "Reachable peer count."),
        field("queueDepth", "number", true, "Local pending bundle count."),
        field("cpuLoad", "number", true, "Normalized CPU load."),
        field("memoryUsedMb", "number", true, "Memory used in MB."),
        field("networkReachable", "boolean", true, "Whether the local mesh is reachable."),
        field("foundryReachable", "boolean", true, "Whether Foundry/CASK uplink is reachable."),
        field("modelStatus", "string", true, "ready, unavailable, or disabled."),
      ],
    },
  ],
  linkTypes: [
    link("caskMissionHasInstruction", "Mission Has Instruction", "CaskMission", "CaskMissionInstruction", "Mission-to-deployment instruction containment."),
    link("caskInstructionGovernedByPolicy", "Instruction Governed By Policy", "CaskMissionInstruction", "CaskPolicyDecision", "Instruction policy review and deployability decision."),
    link("caskInstructionCreatesDeployment", "Instruction Creates Deployment", "CaskMissionInstruction", "CaskDeploymentOrder", "Mission instruction to node deployment order."),
    link("caskDeploymentAssignsLease", "Deployment Assigns Lease", "CaskDeploymentOrder", "CaskNodeLease", "Deployment order to short-lived node role leases."),
    link("caskDeploymentEmitsTimeline", "Deployment Emits Timeline", "CaskDeploymentOrder", "CaskMissionTimelineEvent", "Deployment order to audit/replay timeline events."),
    link("caskLeaseTargetsEdgeNode", "Lease Targets Edge Node", "CaskNodeLease", "CaskEdgeNode", "Node lease to participating Pi/Jetson node."),
    link("caskMissionHasObservation", "Mission Has Observation", "CaskMission", "CaskSensorObservation", "Mission-to-evidence containment."),
    link("caskObservationSupportsFix", "Observation Supports Location Fix", "CaskSensorObservation", "CaskLocationFix", "RFID/provider-style observation to coarse fix."),
    link("caskObservationSupportsUas", "Observation Supports UAS Observation", "CaskSensorObservation", "CaskUasObservation", "Camera/audio/context evidence to UAS observation."),
    link("caskEvidenceSupportsEstimate", "Evidence Supports Control Source Estimate", "CaskLocationFix", "CaskControlSourceEstimate", "Coarse location evidence supporting an estimate."),
    link("caskEstimateSupportsCue", "Estimate Supports Cue", "CaskControlSourceEstimate", "CaskCounterUasCue", "Estimate-to-cue traceability."),
    link("caskCueProducesTagObjective", "Cue Produces Tag Objective", "CaskCounterUasCue", "CaskTagObjective", "Policy-gated cue to non-contact tag objective."),
    link("caskObjectiveAssignsInstruction", "Objective Assigns Instruction", "CaskTagObjective", "CaskNodeInstruction", "Per-node tag-plan instructions."),
    link("caskDeploymentSeedsGossip", "Deployment Seeds Gossip", "CaskDeploymentOrder", "CaskGossipWorldState", "Deployment order becomes part of the gossip world state."),
    link("caskDeploymentSeedsCoordinator", "Deployment Seeds Coordinator", "CaskDeploymentOrder", "CaskCoordinatorDirective", "Deployment order gives the elected coordinator its mission context."),
    link("caskGossipFeedsCoordinator", "Gossip Feeds Coordinator", "CaskGossipWorldState", "CaskCoordinatorDirective", "Gossip world state used by the elected coordinator."),
    link("caskCoordinatorIssuesInstruction", "Coordinator Issues Instruction", "CaskCoordinatorDirective", "CaskNodeInstruction", "Singleton coordinator directive to per-node display instructions."),
    link("caskBundleProducesInsight", "Bundle Produces Insight", "CaskMission", "CaskInsightDraft", "Mission-context insight draft."),
  ],
  actionTypes: [
    action("createCaskMissionInstruction", "Create CASK Mission Instruction", "CaskMissionInstruction", "Write an operator-provided mission instruction packet."),
    action("createCaskPolicyDecision", "Create CASK Policy Decision", "CaskPolicyDecision", "Write deployability and sharing policy decisions for mission instructions."),
    action("createCaskDeploymentOrder", "Create CASK Deployment Order", "CaskDeploymentOrder", "Write a policy-gated Pi/Jetson deployment order."),
    action("upsertCaskNodeLease", "Upsert CASK Node Lease", "CaskNodeLease", "Write current node role leases for sensing, relay, display, gateway, and coordinator candidacy."),
    action("createCaskMissionTimelineEvent", "Create CASK Mission Timeline Event", "CaskMissionTimelineEvent", "Write auditable instruction, policy, lease, and activation timeline events."),
    action("createCaskSensorObservation", "Create CASK Sensor Observation", "CaskSensorObservation", "Write normalized camera, audio, RFID, or provider-style observations."),
    action("createCaskLocationFix", "Create CASK Location Fix", "CaskLocationFix", "Write coarse RFID/provider-style location fixes."),
    action("createCaskUasObservation", "Create CASK UAS Observation", "CaskUasObservation", "Write policy-allowed drone-class observations."),
    action("createCaskControlSourceEstimate", "Create CASK Control Source Estimate", "CaskControlSourceEstimate", "Write fused estimate records."),
    action("createCaskCounterUasCue", "Create CASK Counter-UAS Cue", "CaskCounterUasCue", "Write human-review cues."),
    action("createCaskTagObjective", "Create CASK Training Tag Objective", "CaskTagObjective", "Write non-contact training tag objective state."),
    action("upsertCaskNodeInstruction", "Upsert CASK Node Instruction", "CaskNodeInstruction", "Write per-node display instructions and fallback assignment."),
    action("createCaskGossipWorldState", "Create CASK Gossip World State", "CaskGossipWorldState", "Write gossip-derived shared awareness snapshots."),
    action("createCaskCoordinatorDirective", "Create CASK Coordinator Directive", "CaskCoordinatorDirective", "Write singleton Raft-term coordinator output."),
    action("createCaskInsightDraft", "Create CASK Insight Draft", "CaskInsightDraft", "Write node-local LLM draft with citations and limitations."),
    action("upsertCaskNodeHealth", "Upsert CASK Node Health", "CaskNodeHealth", "Write node health and local model status."),
  ],
};

export function caskActionApiNames(): string[] {
  return caskOntologyShape.actionTypes.map((actionType) => actionType.apiName);
}

function field(
  name: string,
  kind: CaskFieldKind,
  required: boolean,
  description: string,
): CaskOntologyField {
  return { name, kind, required, description };
}

function link(
  apiName: string,
  displayName: string,
  fromObject: string,
  toObject: string,
  description: string,
): CaskOntologyLinkType {
  return { apiName, displayName, fromObject, toObject, description };
}

function action(
  apiName: string,
  displayName: string,
  objectType: string,
  purpose: string,
): CaskOntologyActionType {
  return { apiName, displayName, objectType, purpose };
}

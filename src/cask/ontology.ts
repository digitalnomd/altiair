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
    link("caskMissionHasObservation", "Mission Has Observation", "CaskMission", "CaskSensorObservation", "Mission-to-evidence containment."),
    link("caskObservationSupportsFix", "Observation Supports Location Fix", "CaskSensorObservation", "CaskLocationFix", "RFID/provider-style observation to coarse fix."),
    link("caskObservationSupportsUas", "Observation Supports UAS Observation", "CaskSensorObservation", "CaskUasObservation", "Camera/audio/context evidence to UAS observation."),
    link("caskEvidenceSupportsEstimate", "Evidence Supports Control Source Estimate", "CaskLocationFix", "CaskControlSourceEstimate", "Coarse location evidence supporting an estimate."),
    link("caskEstimateSupportsCue", "Estimate Supports Cue", "CaskControlSourceEstimate", "CaskCounterUasCue", "Estimate-to-cue traceability."),
    link("caskCueProducesTagObjective", "Cue Produces Tag Objective", "CaskCounterUasCue", "CaskTagObjective", "Policy-gated cue to non-contact tag objective."),
    link("caskObjectiveAssignsInstruction", "Objective Assigns Instruction", "CaskTagObjective", "CaskNodeInstruction", "Per-node tag-plan instructions."),
    link("caskBundleProducesInsight", "Bundle Produces Insight", "CaskMission", "CaskInsightDraft", "Mission-context insight draft."),
  ],
  actionTypes: [
    action("createCaskSensorObservation", "Create CASK Sensor Observation", "CaskSensorObservation", "Write normalized camera, audio, RFID, or provider-style observations."),
    action("createCaskLocationFix", "Create CASK Location Fix", "CaskLocationFix", "Write coarse RFID/provider-style location fixes."),
    action("createCaskUasObservation", "Create CASK UAS Observation", "CaskUasObservation", "Write policy-allowed drone-class observations."),
    action("createCaskControlSourceEstimate", "Create CASK Control Source Estimate", "CaskControlSourceEstimate", "Write fused estimate records."),
    action("createCaskCounterUasCue", "Create CASK Counter-UAS Cue", "CaskCounterUasCue", "Write human-review cues."),
    action("createCaskTagObjective", "Create CASK Training Tag Objective", "CaskTagObjective", "Write non-contact training tag objective state."),
    action("upsertCaskNodeInstruction", "Upsert CASK Node Instruction", "CaskNodeInstruction", "Write per-node display instructions and fallback assignment."),
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

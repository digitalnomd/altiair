import type { IsoTimestamp, PolicyState } from "./types.js";
import type { MeshTopology, NodeDescriptor, PeerObservation } from "../mesh/types.js";

export type MissionSensorKind = "rfid" | "audio" | "camera" | "node_health";

export type MissionObjectiveType =
  | "controlled_training_tag"
  | "counter_uas_review"
  | "mesh_resilience_drill";

export type CaskDeploymentState =
  | "deployable"
  | "deployed"
  | "blocked";

export type CaskNodeLeaseRole =
  | "mission_lan_host"
  | "sensor_rfid"
  | "sensor_audio"
  | "sensor_camera"
  | "coordinator_candidate"
  | "operator_display"
  | "foundry_gateway"
  | "fallback_relay";

export type CaskNodeLeaseState = "assigned" | "standby" | "blocked";

export type CaskMissionTimelineEventType =
  | "instruction_received"
  | "policy_checked"
  | "node_lease_assigned"
  | "deployment_activated"
  | "deployment_blocked";

export interface MissionInstructionInput {
  missionId?: string;
  title?: string;
  missionText: string;
  objectiveType?: MissionObjectiveType;
  authorizedZoneId?: string;
  subjectRef?: string;
  requiredSensorKinds?: MissionSensorKind[];
  operatorAuthorized?: boolean;
  requestedBy?: string;
  createdAt?: IsoTimestamp;
}

export interface CaskPolicyDecision {
  policyDecisionId: string;
  instructionId: string;
  missionId: string;
  decidedAt: IsoTimestamp;
  policyState: PolicyState;
  deployable: boolean;
  requiresHumanReview: boolean;
  blockedReasons: string[];
  reviewReasons: string[];
  allowedActions: string[];
  rejectedActions: string[];
}

export interface CaskMissionInstruction {
  instructionId: string;
  missionId: string;
  title: string;
  missionText: string;
  objectiveType: MissionObjectiveType;
  authorizedZoneId: string;
  subjectRef: string;
  requiredSensorKinds: MissionSensorKind[];
  operatorAuthorized: boolean;
  requestedBy: string;
  createdAt: IsoTimestamp;
  policyState: PolicyState;
  policyDecision: CaskPolicyDecision;
  constraints: string[];
}

export interface CaskNodeLease {
  leaseId: string;
  deploymentId: string;
  nodeId: string;
  hostname: string;
  roles: CaskNodeLeaseRole[];
  state: CaskNodeLeaseState;
  priority: number;
  assignedAt: IsoTimestamp;
  leaseExpiresAt: IsoTimestamp;
  apiBaseUrl: string;
  startupCommand: string;
  instruction: string;
  fallbackNodeIds: string[];
  sensorEventKinds: MissionSensorKind[];
  requiredEndpoints: string[];
  policyState: PolicyState;
}

export interface CaskMissionTimelineEvent {
  timelineEventId: string;
  deploymentId: string;
  missionId: string;
  eventType: CaskMissionTimelineEventType;
  occurredAt: IsoTimestamp;
  nodeId?: string;
  summary: string;
  payloadJson?: Record<string, unknown>;
}

export interface CaskDeploymentOrder {
  deploymentId: string;
  instructionId: string;
  missionId: string;
  title: string;
  state: CaskDeploymentState;
  objectiveType: MissionObjectiveType;
  authorizedZoneId: string;
  subjectRef: string;
  createdAt: IsoTimestamp;
  deployedAt?: IsoTimestamp;
  deployable: boolean;
  requiresHumanReview: boolean;
  blockedReasons: string[];
  operatorSummary: string;
  policyDecision: CaskPolicyDecision;
  nodeLeases: CaskNodeLease[];
  timeline: CaskMissionTimelineEvent[];
  startupSequence: string[];
  foundryActionPlan: {
    uploadMode: "queued_until_ontology_actions_exist";
    actionApiNames: string[];
  };
}

export interface BuildMissionInstructionOptions {
  createdAt?: Date;
}

export interface BuildDeploymentOrderOptions {
  createdAt?: Date;
  deploy?: boolean;
}

const defaultRequiredSensors: MissionSensorKind[] = ["rfid", "audio", "camera", "node_health"];

const blockedTerms: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bkill\b/i, reason: "Contains kill language." },
  { pattern: /\beliminate\b/i, reason: "Contains eliminate language." },
  { pattern: /\btake\s*out\b/i, reason: "Contains take-out language." },
  { pattern: /\bshoot\b/i, reason: "Contains shooting language." },
  { pattern: /\bstrike\b/i, reason: "Contains strike language." },
  { pattern: /\bengage\b/i, reason: "Contains engagement language." },
  { pattern: /\bcapture\b/i, reason: "Contains capture language." },
  { pattern: /\bdetain\b/i, reason: "Contains detain language." },
  { pattern: /\bpursu(e|it)\b/i, reason: "Contains pursuit language." },
  { pattern: /\bchase\b/i, reason: "Contains chase language." },
  { pattern: /\btarget\s*prosecution\b/i, reason: "Contains target-prosecution language." },
  { pattern: /\benemy\s+target\b/i, reason: "Contains operational enemy-target language." },
];

const reviewTerms: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\btarget\b/i, reason: "Uses target language; constrain interpretation to authorized training subject, asset, or object." },
  { pattern: /\benemy\b/i, reason: "Uses enemy language; requires human review and demo-safe framing." },
  { pattern: /\boperator\b/i, reason: "Mentions an operator; keep output to evidence cueing and human review." },
];

export function sampleMissionInstructionInput(): MissionInstructionInput {
  return {
    missionId: "mission-live-edge",
    title: "CASK controlled training tag",
    missionText:
      "Deploy the Pi and Jetson CASK mesh to collect RFID, microphone, camera, and node-health evidence for a controlled training tag in training-zone-alpha. Share the fused cue to all reachable edge nodes and keep Foundry writeback queued until policy and connectivity allow it.",
    objectiveType: "controlled_training_tag",
    authorizedZoneId: "training-zone-alpha",
    subjectRef: "training-tag-001",
    requiredSensorKinds: defaultRequiredSensors,
    operatorAuthorized: true,
    requestedBy: "Sarah Hatcher",
  };
}

export function buildMissionInstruction(
  input: MissionInstructionInput,
  options: BuildMissionInstructionOptions = {},
): CaskMissionInstruction {
  const createdAt = parseOrDefaultDate(input.createdAt, options.createdAt ?? new Date());
  const missionText = requiredText(input.missionText, "missionText");
  const missionId = cleanId(input.missionId ?? "mission-live-edge");
  const title = input.title?.trim() || "CASK mission instruction";
  const instructionId = `instr-${missionId}-${shortHash(`${missionText}:${createdAt.toISOString()}`)}`;
  const authorizedZoneId = input.authorizedZoneId?.trim() || "training-zone-alpha";
  const subjectRef = input.subjectRef?.trim() || "training-tag-001";
  const operatorAuthorized = input.operatorAuthorized ?? false;
  const policyDecision = buildPolicyDecision(
    {
      instructionId,
      missionId,
      missionText,
      operatorAuthorized,
      authorizedZoneId,
      subjectRef,
    },
    createdAt,
  );

  return {
    instructionId,
    missionId,
    title,
    missionText,
    objectiveType: input.objectiveType ?? "controlled_training_tag",
    authorizedZoneId,
    subjectRef,
    requiredSensorKinds: normalizeSensorKinds(input.requiredSensorKinds),
    operatorAuthorized,
    requestedBy: input.requestedBy?.trim() || "Sarah Hatcher",
    createdAt: createdAt.toISOString(),
    policyState: policyDecision.policyState,
    policyDecision,
    constraints: [
      "Controlled training tag, evidence review, observation, relay, and deconfliction only.",
      "No target prosecution, engagement, pursuit, capture, restraint, harm, or autonomous action.",
      "Every deployment output must include policy state, uncertainty, evidence IDs, and human-review status.",
      "Raw media and Foundry writeback remain policy-gated; compact records and hashes replicate locally.",
    ],
  };
}

export function buildDeploymentOrder(
  instruction: CaskMissionInstruction,
  topology: MeshTopology,
  observations: PeerObservation[],
  options: BuildDeploymentOrderOptions = {},
): CaskDeploymentOrder {
  const createdAt = options.createdAt ?? new Date();
  const deploymentId = `deploy-${instruction.instructionId.replace(/^instr-/, "")}`;
  const deployable = instruction.policyDecision.deployable;
  const state: CaskDeploymentState = deployable
    ? options.deploy === false
      ? "deployable"
      : "deployed"
    : "blocked";
  const nodeLeases = deployable
    ? buildNodeLeases(deploymentId, instruction, topology, observations, createdAt)
    : [];
  const timeline = buildTimeline(deploymentId, instruction, nodeLeases, state, createdAt);

  return {
    deploymentId,
    instructionId: instruction.instructionId,
    missionId: instruction.missionId,
    title: instruction.title,
    state,
    objectiveType: instruction.objectiveType,
    authorizedZoneId: instruction.authorizedZoneId,
    subjectRef: instruction.subjectRef,
    createdAt: createdAt.toISOString(),
    deployedAt: state === "deployed" ? createdAt.toISOString() : undefined,
    deployable,
    requiresHumanReview: instruction.policyDecision.requiresHumanReview,
    blockedReasons: instruction.policyDecision.blockedReasons,
    operatorSummary: summarizeDeployment(instruction, nodeLeases, state),
    policyDecision: instruction.policyDecision,
    nodeLeases,
    timeline,
    startupSequence: nodeLeases.map((lease) => lease.startupCommand),
    foundryActionPlan: {
      uploadMode: "queued_until_ontology_actions_exist",
      actionApiNames: [
        "createCaskMissionInstruction",
        "createCaskDeploymentOrder",
        "upsertCaskNodeLease",
        "createCaskPolicyDecision",
        "createCaskMissionTimelineEvent",
      ],
    },
  };
}

function buildPolicyDecision(
  input: {
    instructionId: string;
    missionId: string;
    missionText: string;
    operatorAuthorized: boolean;
    authorizedZoneId: string;
    subjectRef: string;
  },
  decidedAt: Date,
): CaskPolicyDecision {
  const blockedReasons = blockedTerms
    .filter(({ pattern }) => pattern.test(input.missionText))
    .map(({ reason }) => reason);
  const reviewReasons = reviewTerms
    .filter(({ pattern }) => pattern.test(input.missionText))
    .map(({ reason }) => reason);
  if (!input.operatorAuthorized) {
    reviewReasons.push("Operator authorization has not been marked complete.");
  }
  if (input.authorizedZoneId.length === 0) {
    reviewReasons.push("No authorized zone was provided.");
  }
  if (input.subjectRef.length === 0) {
    reviewReasons.push("No tagged training subject, asset, or object reference was provided.");
  }

  const policyState: PolicyState = blockedReasons.length > 0
    ? "blocked"
    : input.operatorAuthorized
      ? "authorized_to_share"
      : "review_needed";

  return {
    policyDecisionId: `policy-${input.instructionId}`,
    instructionId: input.instructionId,
    missionId: input.missionId,
    decidedAt: decidedAt.toISOString(),
    policyState,
    deployable: policyState !== "blocked",
    requiresHumanReview: policyState !== "authorized_to_share" || reviewReasons.length > 0,
    blockedReasons,
    reviewReasons,
    allowedActions: [
      "Collect camera, microphone, RFID, provider-style location, and node-health evidence.",
      "Run local fusion and gossip across reachable Pi and Jetson nodes.",
      "Elect exactly one coordinator LLM for a Raft-style term.",
      "Publish per-node observation, relay, display, and verification instructions.",
      "Queue Foundry/CASK writeback until policy and connectivity allow it.",
    ],
    rejectedActions: [
      "No engagement order.",
      "No autonomous action.",
      "No pursuit, chase, capture, restraint, or harm.",
      "No raw-media release outside policy-approved channels.",
    ],
  };
}

function buildNodeLeases(
  deploymentId: string,
  instruction: CaskMissionInstruction,
  topology: MeshTopology,
  observations: PeerObservation[],
  assignedAt: Date,
): CaskNodeLease[] {
  const preferred = preferredNodes(topology);

  return topology.nodes.map((node, index) => {
    const roles = rolesForNode(node, preferred);
    const observation = observations.find((candidate) => candidate.nodeId === node.id);
    const online = observation?.online ?? true;
    const leaseState: CaskNodeLeaseState = online ? "assigned" : "standby";
    return {
      leaseId: `lease-${deploymentId}-${node.id}`,
      deploymentId,
      nodeId: node.id,
      hostname: node.hostname,
      roles,
      state: leaseState,
      priority: leasePriority(roles, node.gatewayPriority, index),
      assignedAt: assignedAt.toISOString(),
      leaseExpiresAt: addSeconds(assignedAt, 10 * 60).toISOString(),
      apiBaseUrl: `http://${node.overlayAddress}:${node.apiPort}`,
      startupCommand: `ALTIAIR_NODE_ID=${node.id} npm run node:api -- --node ${node.id} --host 0.0.0.0 --port ${node.apiPort}`,
      instruction: instructionForRoles(roles, instruction),
      fallbackNodeIds: topology.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => candidate.id),
      sensorEventKinds: sensorKindsForRoles(roles, instruction.requiredSensorKinds),
      requiredEndpoints: [
        "POST /sensor-events",
        "GET /dashboard",
        "GET /gossip/world",
        "GET /coordinator/latest",
        "GET /instructions/latest",
        "GET /mission/deployment/latest",
      ],
      policyState: instruction.policyState,
    };
  }).sort((left, right) => right.priority - left.priority || left.nodeId.localeCompare(right.nodeId));
}

function preferredNodes(topology: MeshTopology): Record<"hub" | "rfid" | "audio" | "camera", NodeDescriptor | undefined> {
  return {
    hub: findNode(topology, "altiair-hub") ??
      topology.nodes.find((node) => node.roles.includes("mesh_hub") || node.roles.includes("operator_display")),
    rfid: findNode(topology, "altiair-node-a") ?? findNodeByCapability(topology, "rfid"),
    audio: findNode(topology, "altiair-node-b") ?? findNodeByCapability(topology, "microphone") ?? findNodeByCapability(topology, "audio"),
    camera: findNode(topology, "altiair-orin") ??
      topology.nodes.find((node) => node.roles.includes("accelerated_inference")) ??
      findNodeByCapability(topology, "camera"),
  };
}

function rolesForNode(
  node: NodeDescriptor,
  preferred: Record<"hub" | "rfid" | "audio" | "camera", NodeDescriptor | undefined>,
): CaskNodeLeaseRole[] {
  const roles: CaskNodeLeaseRole[] = [];
  if (node.roles.includes("mission_lan_host")) {
    roles.push("mission_lan_host");
  }
  if (node.roles.includes("operator_display")) {
    roles.push("operator_display");
  }
  if (node.roles.includes("foundry_gateway")) {
    roles.push("foundry_gateway");
  }
  if (hasLocalModel(node)) {
    roles.push("coordinator_candidate");
  }
  if (preferred.rfid?.id === node.id) {
    roles.push("sensor_rfid");
  }
  if (preferred.audio?.id === node.id) {
    roles.push("sensor_audio");
  }
  if (preferred.camera?.id === node.id) {
    roles.push("sensor_camera");
  }
  if (roles.length === 0 || node.id !== preferred.hub?.id) {
    roles.push("fallback_relay");
  }
  return unique(roles);
}

function instructionForRoles(roles: CaskNodeLeaseRole[], instruction: CaskMissionInstruction): string {
  const steps: string[] = [];
  if (roles.includes("mission_lan_host")) {
    steps.push("Host or join the private Altiair-LAN and keep the local node API reachable.");
  }
  if (roles.includes("operator_display")) {
    steps.push("Serve the operator display and show mission state, node leases, policy state, evidence IDs, and coordinator term.");
  }
  if (roles.includes("foundry_gateway")) {
    steps.push("Queue Foundry/CASK OSDK writeback and sync only when policy, ontology resources, and connectivity allow it.");
  }
  if (roles.includes("sensor_rfid")) {
    steps.push(`Run the RFID adapter for ${instruction.subjectRef} and post rfid_read events with reader, zone, RSSI, and confidence.`);
  }
  if (roles.includes("sensor_audio")) {
    steps.push("Run the microphone adapter and post compact audio_window events with transcript/acoustic metadata.");
  }
  if (roles.includes("sensor_camera")) {
    steps.push("Run local camera inference and post camera_detection events with class, confidence, zone, and media reference.");
  }
  if (roles.includes("coordinator_candidate")) {
    steps.push("Run local LLM/gossip; publish coordinator directives only when this node is elected leader for the active term.");
  }
  if (roles.includes("fallback_relay")) {
    steps.push("Relay compact CASK records, preserve the local ledger, and take over leased duties only when the assigned node is unavailable.");
  }
  return steps.join(" ");
}

function sensorKindsForRoles(
  roles: CaskNodeLeaseRole[],
  requiredSensorKinds: MissionSensorKind[],
): MissionSensorKind[] {
  const kinds: MissionSensorKind[] = [];
  if (roles.includes("sensor_rfid") && requiredSensorKinds.includes("rfid")) {
    kinds.push("rfid");
  }
  if (roles.includes("sensor_audio") && requiredSensorKinds.includes("audio")) {
    kinds.push("audio");
  }
  if (roles.includes("sensor_camera") && requiredSensorKinds.includes("camera")) {
    kinds.push("camera");
  }
  if (requiredSensorKinds.includes("node_health")) {
    kinds.push("node_health");
  }
  return unique(kinds);
}

function buildTimeline(
  deploymentId: string,
  instruction: CaskMissionInstruction,
  leases: CaskNodeLease[],
  state: CaskDeploymentState,
  occurredAt: Date,
): CaskMissionTimelineEvent[] {
  const events: CaskMissionTimelineEvent[] = [
    timelineEvent(
      deploymentId,
      instruction.missionId,
      "instruction_received",
      occurredAt,
      "Mission instruction accepted into the local CASK deployment queue.",
      { instructionId: instruction.instructionId },
    ),
    timelineEvent(
      deploymentId,
      instruction.missionId,
      "policy_checked",
      occurredAt,
      `Policy state is ${instruction.policyDecision.policyState}.`,
      {
        policyDecisionId: instruction.policyDecision.policyDecisionId,
        blockedReasons: instruction.policyDecision.blockedReasons,
        reviewReasons: instruction.policyDecision.reviewReasons,
      },
    ),
  ];

  for (const lease of leases) {
    events.push({
      ...timelineEvent(
        deploymentId,
        instruction.missionId,
        "node_lease_assigned",
        occurredAt,
        `${lease.nodeId} leased for ${lease.roles.join(", ")}.`,
        { leaseId: lease.leaseId, roles: lease.roles, state: lease.state },
      ),
      nodeId: lease.nodeId,
    });
  }

  events.push(timelineEvent(
    deploymentId,
    instruction.missionId,
    state === "blocked" ? "deployment_blocked" : "deployment_activated",
    occurredAt,
    state === "blocked"
      ? `Deployment blocked: ${instruction.policyDecision.blockedReasons.join("; ")}`
      : `Deployment ${state}; ${leases.length} node leases are available to the mesh.`,
    { deploymentState: state },
  ));

  return events.map((event, index) => ({
    ...event,
    timelineEventId: `${event.timelineEventId}-${index + 1}`,
  }));
}

function timelineEvent(
  deploymentId: string,
  missionId: string,
  eventType: CaskMissionTimelineEventType,
  occurredAt: Date,
  summary: string,
  payloadJson?: Record<string, unknown>,
): CaskMissionTimelineEvent {
  return {
    timelineEventId: `event-${deploymentId}-${eventType}`,
    deploymentId,
    missionId,
    eventType,
    occurredAt: occurredAt.toISOString(),
    summary,
    payloadJson,
  };
}

function summarizeDeployment(
  instruction: CaskMissionInstruction,
  leases: CaskNodeLease[],
  state: CaskDeploymentState,
): string {
  if (state === "blocked") {
    return `Deployment blocked by CASK policy: ${instruction.policyDecision.blockedReasons.join("; ")}.`;
  }
  const roleSummary = leases
    .map((lease) => `${lease.nodeId}:${lease.roles.join("+")}`)
    .join(", ");
  return `${instruction.title} is ${state} for ${instruction.authorizedZoneId}; ${leases.length} node leases active. ${roleSummary}`;
}

function leasePriority(roles: CaskNodeLeaseRole[], gatewayPriority: number, index: number): number {
  let score = gatewayPriority + Math.max(0, 10 - index);
  score += roles.includes("operator_display") ? 30 : 0;
  score += roles.includes("mission_lan_host") ? 25 : 0;
  score += roles.includes("sensor_camera") ? 18 : 0;
  score += roles.includes("sensor_rfid") ? 16 : 0;
  score += roles.includes("sensor_audio") ? 14 : 0;
  score += roles.includes("coordinator_candidate") ? 12 : 0;
  score += roles.includes("foundry_gateway") ? 10 : 0;
  return score;
}

function normalizeSensorKinds(kinds: MissionSensorKind[] | undefined): MissionSensorKind[] {
  if (kinds === undefined || kinds.length === 0) {
    return defaultRequiredSensors;
  }
  const allowed = new Set(defaultRequiredSensors);
  return unique(kinds.filter((kind) => allowed.has(kind)));
}

function findNode(topology: MeshTopology, nodeId: string): NodeDescriptor | undefined {
  return topology.nodes.find((node) => node.id === nodeId);
}

function findNodeByCapability(topology: MeshTopology, token: string): NodeDescriptor | undefined {
  return topology.nodes.find((node) =>
    node.capabilities.some((capability) =>
      `${capability.name} ${capability.detail}`.toLowerCase().includes(token.toLowerCase()),
    ),
  );
}

function hasLocalModel(node: NodeDescriptor): boolean {
  return node.capabilities.some((capability) => capability.name === "local_llm") ||
    node.roles.includes("mesh_hub") ||
    node.roles.includes("accelerated_inference") ||
    node.roles.includes("operator_display") ||
    node.roles.includes("edge_sensor");
}

function requiredText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (text === undefined || text.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return text;
}

function parseOrDefaultDate(value: string | undefined, fallback: Date): Date {
  if (value === undefined) {
    return fallback;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("createdAt must be an ISO timestamp.");
  }
  return parsed;
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function cleanId(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "mission-live-edge";
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

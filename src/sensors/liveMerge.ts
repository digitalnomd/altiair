import type {
  AudioEvent,
  CameraEvent,
  CaskBundle,
  Confidence,
  CounterUasCue,
  DroneObservation,
  LocationFix,
  NodeHealth,
  PolicyState,
  ProviderStyleNetworkEnvelope,
  ProviderStyleLocationEvent,
  RfidEvent,
  SensorEvent,
} from "../cask/types.js";
import { defaultDdilMeshTopology } from "../mesh/defaultTopology.js";

export type LiveSensorInput =
  | LiveCameraDetectionInput
  | LiveAudioWindowInput
  | LiveRfidReadInput
  | LiveNodeHealthInput;

export interface BaseLiveSensorInput {
  sourceNodeId: string;
  observedAt?: string;
  receivedAt?: string;
  zoneId?: string;
  confidence?: number;
  policyState?: PolicyState;
  isTestFixture?: boolean;
}

export interface LiveCameraDetectionInput extends BaseLiveSensorInput {
  kind: "camera_detection";
  cameraId: string;
  detectionClass: string;
  boundingRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameRef?: string;
  thumbnailRef?: string;
  retentionPolicy?: CameraEvent["retentionPolicy"];
}

export interface LiveAudioWindowInput extends BaseLiveSensorInput {
  kind: "audio_window";
  microphoneId: string;
  vadWindowMs?: [number, number];
  transcript?: string;
  asrConfidence?: number;
  acousticClass?: string;
  redactedAudioRef?: string;
}

export interface LiveRfidReadInput extends BaseLiveSensorInput {
  kind: "rfid_read";
  readerId: string;
  tagId: string;
  antennaId?: string;
  rssi?: number;
  readCount?: number;
  matchedFoundryObjectRid?: string;
  providerStyle?: {
    sourceId?: string;
    entityId?: string;
    precisionRadiusMeters?: number;
    expiresAt?: string;
    providerName?: string;
    emulationProfile?: ProviderStyleNetworkEnvelope["emulationProfile"];
    transport?: ProviderStyleNetworkEnvelope["transport"];
    networkId?: string;
    cellId?: string;
    sectorId?: string;
    accessPointId?: string;
    wifiBssidHash?: string;
    verificationMethod?: ProviderStyleNetworkEnvelope["verificationMethod"];
    isSimulated?: boolean;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface LiveNodeHealthInput {
  kind: "node_health";
  nodeId: string;
  observedAt?: string;
  peerCount?: number;
  queueDepth?: number;
  cpuLoad?: number;
  memoryUsedMb?: number;
  networkReachable?: boolean;
  foundryReachable?: boolean;
  modelStatus?: NodeHealth["modelStatus"];
}

export interface LiveSensorMergeOptions {
  missionId?: string;
  bundleId?: string;
  sourceNodeId?: string;
  createdAt?: Date;
  defaultZoneId?: string;
  defaultPrecisionRadiusMeters?: number;
  providerLocationTtlMs?: number;
}

export function buildCaskBundleFromLiveInputs(
  inputs: LiveSensorInput[],
  options: LiveSensorMergeOptions = {},
): CaskBundle {
  if (inputs.length === 0) {
    throw new Error("At least one live sensor input is required.");
  }

  const createdAtDate = options.createdAt ?? new Date();
  const createdAt = createdAtDate.toISOString();
  const missionId = options.missionId ?? "mission-live-edge";
  const sourceNodeId = options.sourceNodeId ?? coordinatorNodeIdFrom(inputs);
  const sensorEvents: SensorEvent[] = [];
  const locationFixes: LocationFix[] = [];
  const droneObservations: DroneObservation[] = [];
  const nodeHealth = buildNodeHealth(inputs, createdAt);

  inputs.forEach((input, index) => {
    switch (input.kind) {
      case "camera_detection": {
        const event = cameraEvent(input, index, createdAt, options);
        sensorEvents.push(event);
        if (looksLikeDroneDetection(input.detectionClass)) {
          droneObservations.push(droneObservationFrom(event, index));
        }
        break;
      }
      case "audio_window":
        sensorEvents.push(audioEvent(input, index, createdAt, options));
        break;
      case "rfid_read": {
        const event = rfidEvent(input, index, createdAt, options);
        const providerEvent = providerStyleLocationEvent(input, event, index, createdAt, options);
        sensorEvents.push(event, providerEvent);
        locationFixes.push(locationFixFrom(input, providerEvent, event, index, createdAt, options));
        break;
      }
      case "node_health":
        break;
    }
  });

  const controlSourceEstimates = buildControlSourceEstimates(
    missionId,
    sourceNodeId,
    createdAtDate,
    sensorEvents,
    locationFixes,
    droneObservations,
  );
  const counterUasCues = buildCounterUasCues(createdAt, droneObservations, locationFixes, controlSourceEstimates);

  return {
    id: options.bundleId ?? `bundle-${missionId}-${stableTimeId(createdAt)}`,
    missionId,
    sourceNodeId,
    createdAt,
    sensorEvents,
    locationFixes,
    droneObservations,
    controlSourceEstimates,
    counterUasCues,
    nodeHealth,
    filteringDecision: filteringDecision(sensorEvents, counterUasCues),
    priority: priorityFrom(sensorEvents, droneObservations, locationFixes),
  };
}

function cameraEvent(
  input: LiveCameraDetectionInput,
  index: number,
  fallbackObservedAt: string,
  options: LiveSensorMergeOptions,
): CameraEvent {
  const observedAt = timestamp(input.observedAt, fallbackObservedAt);
  return {
    id: eventId("camera", input.sourceNodeId, observedAt, index),
    kind: "camera",
    sourceNodeId: input.sourceNodeId,
    observedAt,
    receivedAt: timestamp(input.receivedAt, fallbackObservedAt),
    zoneId: input.zoneId ?? options.defaultZoneId,
    confidence: confidence(input.confidence, 0.5),
    policyState: input.policyState ?? "review_needed",
    isTestFixture: input.isTestFixture,
    cameraId: input.cameraId,
    detectionClass: input.detectionClass,
    boundingRegion: input.boundingRegion,
    frameRef: input.frameRef,
    thumbnailRef: input.thumbnailRef,
    retentionPolicy: input.retentionPolicy ?? "metadata_only",
  };
}

function audioEvent(
  input: LiveAudioWindowInput,
  index: number,
  fallbackObservedAt: string,
  options: LiveSensorMergeOptions,
): AudioEvent {
  const observedAt = timestamp(input.observedAt, fallbackObservedAt);
  return {
    id: eventId("audio", input.sourceNodeId, observedAt, index),
    kind: "audio",
    sourceNodeId: input.sourceNodeId,
    observedAt,
    receivedAt: timestamp(input.receivedAt, fallbackObservedAt),
    zoneId: input.zoneId ?? options.defaultZoneId,
    confidence: confidence(input.confidence, input.asrConfidence ?? 0.45),
    policyState: input.policyState ?? "review_needed",
    isTestFixture: input.isTestFixture,
    microphoneId: input.microphoneId,
    vadWindowMs: input.vadWindowMs ?? [0, 0],
    transcript: input.transcript,
    asrConfidence: input.asrConfidence === undefined ? undefined : confidence(input.asrConfidence, 0),
    acousticClass: input.acousticClass,
    redactedAudioRef: input.redactedAudioRef,
  };
}

function rfidEvent(
  input: LiveRfidReadInput,
  index: number,
  fallbackObservedAt: string,
  options: LiveSensorMergeOptions,
): RfidEvent {
  const observedAt = timestamp(input.observedAt, fallbackObservedAt);
  return {
    id: eventId("rfid", input.sourceNodeId, observedAt, index),
    kind: "rfid",
    sourceNodeId: input.sourceNodeId,
    observedAt,
    receivedAt: timestamp(input.receivedAt, fallbackObservedAt),
    zoneId: input.zoneId ?? options.defaultZoneId,
    confidence: confidence(input.confidence, confidenceFromRssi(input.rssi)),
    policyState: input.policyState ?? "review_needed",
    isTestFixture: input.isTestFixture,
    readerId: input.readerId,
    tagId: input.tagId,
    antennaId: input.antennaId,
    rssi: input.rssi,
    readCount: input.readCount ?? 1,
    matchedFoundryObjectRid: input.matchedFoundryObjectRid,
  };
}

function providerStyleLocationEvent(
  input: LiveRfidReadInput,
  event: RfidEvent,
  index: number,
  fallbackObservedAt: string,
  options: LiveSensorMergeOptions,
): ProviderStyleLocationEvent {
  const ttlMs = options.providerLocationTtlMs ?? 5 * 60 * 1000;
  const observedAt = timestamp(input.observedAt, fallbackObservedAt);
  return {
    id: eventId("provider-style-location", input.sourceNodeId, observedAt, index),
    kind: "provider_style_location",
    sourceNodeId: input.sourceNodeId,
    observedAt,
    receivedAt: timestamp(input.receivedAt, fallbackObservedAt),
    zoneId: input.zoneId ?? options.defaultZoneId,
    confidence: confidence(input.confidence, event.confidence),
    policyState: input.policyState ?? event.policyState,
    isTestFixture: input.isTestFixture,
    sourceType: "rfid_provider_style",
    sourceId: input.providerStyle?.sourceId ?? input.readerId,
    entityId: input.providerStyle?.entityId ?? input.tagId,
    precisionRadiusMeters: input.providerStyle?.precisionRadiusMeters ??
      options.defaultPrecisionRadiusMeters ??
      35,
    expiresAt: input.providerStyle?.expiresAt ??
      new Date(Date.parse(observedAt) + ttlMs).toISOString(),
    supportingEvidenceIds: [event.id],
    isCarrierGrade: false,
    providerEnvelope: providerEnvelopeFrom(input),
  };
}

function locationFixFrom(
  input: LiveRfidReadInput,
  providerEvent: ProviderStyleLocationEvent,
  rfid: RfidEvent,
  index: number,
  fallbackObservedAt: string,
  options: LiveSensorMergeOptions,
): LocationFix {
  const observedAt = timestamp(input.observedAt, fallbackObservedAt);
  return {
    id: eventId("location-fix", input.sourceNodeId, observedAt, index),
    entityId: providerEvent.entityId,
    sourceType: "rfid_provider_style",
    sourceIds: [providerEvent.id],
    zoneId: input.zoneId ?? options.defaultZoneId,
    coordinates: input.providerStyle?.coordinates,
    precisionRadiusMeters: providerEvent.precisionRadiusMeters,
    confidence: providerEvent.confidence,
    observedAt,
    expiresAt: providerEvent.expiresAt,
    isCarrierGrade: false,
    supportingEvidenceIds: [rfid.id, providerEvent.id],
    policyState: providerEvent.policyState,
    providerEnvelope: providerEvent.providerEnvelope,
  };
}

function providerEnvelopeFrom(input: LiveRfidReadInput): ProviderStyleNetworkEnvelope {
  return {
    schemaVersion: "altiair-provider-style-v1",
    providerName: input.providerStyle?.providerName ?? "L3Harris-style tactical LTE mock",
    emulationProfile: input.providerStyle?.emulationProfile ?? "l3harris_tactical_lte_mock",
    transport: input.providerStyle?.transport ?? "wifi_rfid",
    networkId: input.providerStyle?.networkId ?? "altiair-private-lte-mock",
    cellId: input.providerStyle?.cellId ?? input.readerId,
    sectorId: input.providerStyle?.sectorId ?? input.antennaId,
    accessPointId: input.providerStyle?.accessPointId,
    wifiBssidHash: input.providerStyle?.wifiBssidHash,
    verificationMethod: input.providerStyle?.verificationMethod ?? "rfid_wifi_proximity",
    isSimulated: input.providerStyle?.isSimulated ?? true,
  };
}

function droneObservationFrom(event: CameraEvent, index: number): DroneObservation {
  return {
    id: eventId("drone-observation", event.sourceNodeId, event.observedAt, index),
    sourceNodeId: event.sourceNodeId,
    droneClass: droneClassFrom(event.detectionClass),
    zoneId: event.zoneId,
    confidence: event.confidence,
    mediaRef: event.thumbnailRef ?? event.frameRef,
    observedAt: event.observedAt,
    supportingEvidenceIds: [event.id],
    policyState: event.policyState,
  };
}

function buildControlSourceEstimates(
  missionId: string,
  sourceNodeId: string,
  createdAt: Date,
  sensorEvents: SensorEvent[],
  locationFixes: LocationFix[],
  droneObservations: DroneObservation[],
) {
  if (droneObservations.length === 0 || locationFixes.length === 0) {
    return [];
  }

  const strongestFix = [...locationFixes].sort((left, right) => right.confidence - left.confidence)[0];
  const strongestDrone = [...droneObservations].sort((left, right) => right.confidence - left.confidence)[0];
  if (strongestFix === undefined || strongestDrone === undefined) {
    return [];
  }

  const audioIds = sensorEvents
    .filter((event) => event.kind === "audio")
    .map((event) => event.id);
  const supportingEvidenceIds = [
    ...strongestDrone.supportingEvidenceIds,
    ...strongestFix.supportingEvidenceIds,
    ...audioIds,
  ];

  return [
    {
      id: `control-${missionId}-${stableTimeId(createdAt.toISOString())}`,
      droneObservationIds: droneObservations.map((observation) => observation.id),
      estimatedZoneId: strongestFix.zoneId ?? strongestDrone.zoneId,
      confidenceRingMeters: Math.max(strongestFix.precisionRadiusMeters, 75),
      confidence: confidence((strongestFix.confidence + strongestDrone.confidence) / 2, 0.5),
      freshnessSeconds: Math.max(0, Math.round((createdAt.getTime() - Date.parse(strongestFix.observedAt)) / 1000)),
      supportingEvidenceIds,
      contradictingEvidenceIds: [],
      policyState: "review_needed" as const,
    },
  ];
}

function buildCounterUasCues(
  createdAt: string,
  droneObservations: DroneObservation[],
  locationFixes: LocationFix[],
  controlSourceEstimates: ReturnType<typeof buildControlSourceEstimates>,
): CounterUasCue[] {
  const estimate = controlSourceEstimates[0];
  const drone = droneObservations[0];
  const fix = locationFixes[0];
  if (estimate === undefined || drone === undefined || fix === undefined) {
    return [];
  }

  return [
    {
      id: `cue-${estimate.id}`,
      droneObservationIds: droneObservations.map((observation) => observation.id),
      controlSourceEstimateId: estimate.id,
      evidence: [
        {
          id: drone.id,
          kind: "drone_observation",
          summary: "Camera inference reports a drone-class observation in the authorized mission area.",
        },
        {
          id: fix.id,
          kind: "location_fix",
          summary: "RFID-derived provider-style location reports a coarse tagged-asset or tagged-subject position.",
        },
        {
          id: estimate.id,
          kind: "control_source_estimate",
          summary: "Local node fusion correlates drone-class visual evidence with RFID location context.",
        },
      ],
      confidence: estimate.confidence,
      policyGate: "review_needed",
      acknowledgementState: "queued",
      recommendedNextChecks: [
        "Verify with a second sensor or human operator before sharing beyond the local mesh.",
        "Check RFID freshness and precision radius before treating the cue as actionable.",
        "Keep the cue in human review; do not generate engagement or autonomous action instructions.",
      ],
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function buildNodeHealth(inputs: LiveSensorInput[], fallbackObservedAt: string): NodeHealth[] {
  const explicitHealth = inputs
    .filter((input): input is LiveNodeHealthInput => input.kind === "node_health")
    .map((input) => ({
      nodeId: input.nodeId,
      nodeRole: nodeRole(input.nodeId),
      observedAt: timestamp(input.observedAt, fallbackObservedAt),
      peerCount: finiteOr(input.peerCount, 0),
      queueDepth: finiteOr(input.queueDepth, 0),
      cpuLoad: confidence(input.cpuLoad, 0),
      memoryUsedMb: finiteOr(input.memoryUsedMb, 0),
      networkReachable: input.networkReachable ?? true,
      foundryReachable: input.foundryReachable ?? false,
      modelStatus: input.modelStatus ?? "ready",
    }));

  const existing = new Set(explicitHealth.map((health) => health.nodeId));
  const inferredHealth = [...new Set(inputs.map(inputNodeId))]
    .filter((nodeId): nodeId is string => nodeId !== undefined && !existing.has(nodeId))
    .map((nodeId) => ({
      nodeId,
      nodeRole: nodeRole(nodeId),
      observedAt: fallbackObservedAt,
      peerCount: 0,
      queueDepth: 0,
      cpuLoad: 0,
      memoryUsedMb: 0,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready" as const,
    }));

  return [...explicitHealth, ...inferredHealth];
}

function inputNodeId(input: LiveSensorInput): string | undefined {
  return input.kind === "node_health" ? input.nodeId : input.sourceNodeId;
}

function nodeRole(nodeId: string): NodeHealth["nodeRole"] {
  const node = defaultDdilMeshTopology.nodes.find((candidate) => candidate.id === nodeId);
  if (node?.platform === "raspberry_pi_5") {
    return "pi5_hub";
  }
  if (node?.platform === "jetson_orin_nano") {
    return "jetson_orin_inference";
  }
  return "pi4_edge";
}

function coordinatorNodeIdFrom(inputs: LiveSensorInput[]): string {
  const inputNodeIds = inputs.map(inputNodeId).filter((nodeId): nodeId is string => nodeId !== undefined);
  if (inputNodeIds.includes("altiair-hub")) {
    return "altiair-hub";
  }
  if (inputNodeIds.includes("altiair-orin")) {
    return "altiair-orin";
  }
  return inputNodeIds[0] ?? "altiair-hub";
}

function filteringDecision(sensorEvents: SensorEvent[], cues: CounterUasCue[]): CaskBundle["filteringDecision"] {
  if (sensorEvents.some((event) => event.policyState === "blocked")) {
    return "review_policy";
  }
  if (cues.length > 0) {
    return "send_now";
  }
  if (sensorEvents.length > 8) {
    return "summarize_first";
  }
  return "send_now";
}

function priorityFrom(
  sensorEvents: SensorEvent[],
  droneObservations: DroneObservation[],
  locationFixes: LocationFix[],
): number {
  const sensorScore = Math.min(sensorEvents.length * 8, 32);
  const droneScore = droneObservations.length > 0 ? 28 : 0;
  const locationScore = locationFixes.length > 0 ? 20 : 0;
  const confidenceScore = Math.round(Math.max(0, ...sensorEvents.map((event) => event.confidence)) * 20);
  return Math.min(100, sensorScore + droneScore + locationScore + confidenceScore);
}

function looksLikeDroneDetection(detectionClass: string): boolean {
  return /drone|uas|uav|quadcopter|one[-_ ]?way/i.test(detectionClass);
}

function droneClassFrom(detectionClass: string): DroneObservation["droneClass"] {
  if (/decoy/i.test(detectionClass)) {
    return "decoy";
  }
  if (/one[-_ ]?way|shahed|low[-_ ]?cost/i.test(detectionClass)) {
    return "low_cost_one_way";
  }
  if (/quadcopter|dji|commercial/i.test(detectionClass)) {
    return "commercial_quadcopter";
  }
  return "unknown";
}

function timestamp(value: string | undefined, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid ISO timestamp "${value}".`);
  }
  return new Date(millis).toISOString();
}

function confidence(value: number | undefined, fallback: number): Confidence {
  if (value === undefined || !Number.isFinite(value)) {
    return clamp01(fallback);
  }
  return clamp01(value);
}

function confidenceFromRssi(rssi: number | undefined): number {
  if (rssi === undefined || !Number.isFinite(rssi)) {
    return 0.55;
  }
  if (rssi >= -45) {
    return 0.8;
  }
  if (rssi <= -85) {
    return 0.35;
  }
  return 0.35 + ((rssi + 85) / 40) * 0.45;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function eventId(kind: string, nodeId: string, observedAt: string, index: number): string {
  return `${kind}-${sanitize(nodeId)}-${stableTimeId(observedAt)}-${index + 1}`;
}

function stableTimeId(value: string): string {
  return value.replace(/\D/g, "").slice(0, 14);
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "node";
}

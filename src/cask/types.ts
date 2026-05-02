export type IsoTimestamp = string;
export type Confidence = number;

export type PolicyState =
  | "collect_only"
  | "review_needed"
  | "authorized_to_share"
  | "blocked";

export type SensorEventKind =
  | "camera"
  | "audio"
  | "rfid"
  | "mock_provider_location";

export type FilteringDecision =
  | "send_now"
  | "summarize_first"
  | "hold"
  | "drop_duplicate"
  | "review_policy";

export interface EvidenceRef {
  id: string;
  kind: SensorEventKind | "location_fix" | "drone_observation" | "control_source_estimate";
  summary: string;
}

export interface BaseSensorEvent {
  id: string;
  kind: SensorEventKind;
  sourceNodeId: string;
  observedAt: IsoTimestamp;
  receivedAt: IsoTimestamp;
  zoneId?: string;
  confidence: Confidence;
  policyState: PolicyState;
  isMock?: boolean;
}

export interface CameraEvent extends BaseSensorEvent {
  kind: "camera";
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
  retentionPolicy: "metadata_only" | "thumbnail_allowed" | "clip_allowed";
}

export interface AudioEvent extends BaseSensorEvent {
  kind: "audio";
  microphoneId: string;
  vadWindowMs: [number, number];
  transcript?: string;
  asrConfidence?: Confidence;
  acousticClass?: string;
  redactedAudioRef?: string;
}

export interface RfidEvent extends BaseSensorEvent {
  kind: "rfid";
  readerId: string;
  tagId: string;
  antennaId?: string;
  rssi?: number;
  readCount: number;
  matchedFoundryObjectRid?: string;
}

export interface MockProviderLocationEvent extends BaseSensorEvent {
  kind: "mock_provider_location";
  sourceType: "mock_provider_rfid";
  sourceId: string;
  entityId: string;
  precisionRadiusMeters: number;
  expiresAt: IsoTimestamp;
  supportingEvidenceIds: string[];
  isMock: true;
}

export type SensorEvent =
  | CameraEvent
  | AudioEvent
  | RfidEvent
  | MockProviderLocationEvent;

export interface LocationFix {
  id: string;
  entityId: string;
  sourceType: "rfid" | "mock_provider_rfid" | "camera" | "audio" | "manual";
  sourceIds: string[];
  zoneId?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  precisionRadiusMeters: number;
  confidence: Confidence;
  observedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  isMock: boolean;
  supportingEvidenceIds: string[];
  policyState: PolicyState;
}

export interface DroneObservation {
  id: string;
  sourceNodeId: string;
  droneClass:
    | "commercial_quadcopter"
    | "low_cost_one_way"
    | "decoy"
    | "unknown";
  zoneId?: string;
  bearingDegrees?: number;
  confidence: Confidence;
  mediaRef?: string;
  observedAt: IsoTimestamp;
  supportingEvidenceIds: string[];
  policyState: PolicyState;
}

export interface ControlSourceEstimate {
  id: string;
  droneObservationIds: string[];
  estimatedZoneId?: string;
  confidenceRingMeters: number;
  confidence: Confidence;
  freshnessSeconds: number;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  policyState: PolicyState;
}

export interface CounterUasCue {
  id: string;
  droneObservationIds: string[];
  controlSourceEstimateId?: string;
  evidence: EvidenceRef[];
  confidence: Confidence;
  policyGate: PolicyState;
  acknowledgementState: "queued" | "seen" | "acknowledged" | "closed";
  recommendedNextChecks: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface NodeHealth {
  nodeId: string;
  nodeRole: "pi4_edge" | "pi5_hub" | "operator_display";
  observedAt: IsoTimestamp;
  peerCount: number;
  queueDepth: number;
  cpuLoad: number;
  memoryUsedMb: number;
  networkReachable: boolean;
  foundryReachable: boolean;
  modelStatus: "ready" | "unavailable" | "disabled";
}

export interface InsightDraft {
  id: string;
  bundleId: string;
  model: string;
  createdAt: IsoTimestamp;
  summary: string;
  confidence: Confidence;
  limitations: string[];
  evidenceIds: string[];
  recommendedNextChecks: string[];
  policyState: PolicyState;
}

export interface CaskBundle {
  id: string;
  missionId: string;
  sourceNodeId: string;
  createdAt: IsoTimestamp;
  sensorEvents: SensorEvent[];
  locationFixes: LocationFix[];
  droneObservations: DroneObservation[];
  controlSourceEstimates: ControlSourceEstimate[];
  counterUasCues: CounterUasCue[];
  nodeHealth: NodeHealth[];
  filteringDecision: FilteringDecision;
  priority: number;
}

export interface UploadAck {
  id: string;
  bundleId: string;
  mode: "mock" | "osdk";
  uploadedAt: IsoTimestamp;
  status: "accepted" | "queued" | "failed";
  appliedActions: string[];
  foundryEdits?: unknown[];
  message?: string;
}

import type { LiveSensorInput } from "../sensors/liveMerge.js";

export interface MockScenarioOptions {
  missionId?: string;
  startAt?: Date;
  intervalMs?: number;
  zoneId?: string;
  subjectTagId?: string;
  includePi5Hub?: boolean;
  includeFailureStep?: boolean;
}

export interface MockScenarioStep {
  id: string;
  title: string;
  description: string;
  events: LiveSensorInput[];
  expectedRuntimeProducts: string[];
}

export interface MockScenario {
  id: string;
  name: string;
  missionId: string;
  zoneId: string;
  subjectTagId: string;
  generatedAt: string;
  steps: MockScenarioStep[];
}

const DEFAULT_START_AT = new Date("2026-05-03T05:00:00.000Z");
const DEFAULT_INTERVAL_MS = 15_000;

export function buildCaskDemoMockScenario(options: MockScenarioOptions = {}): MockScenario {
  const missionId = options.missionId ?? "mission-live-edge";
  const zoneId = options.zoneId ?? "training-zone-alpha";
  const subjectTagId = options.subjectTagId ?? "training-tag-001";
  const startAt = options.startAt ?? DEFAULT_START_AT;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const includePi5Hub = options.includePi5Hub ?? false;
  const includeFailureStep = options.includeFailureStep ?? false;

  const rfid = rfidRead(at(startAt, intervalMs, 0), zoneId, subjectTagId);
  const audio = audioWindow(at(startAt, intervalMs, 1), zoneId);
  const visual = cameraDetection(at(startAt, intervalMs, 2), zoneId);
  const onlineHealth = nodeHealthSet(at(startAt, intervalMs, 0), {
    includePi5Hub,
    degradeNodeB: false,
  });
  const degradedHealth = nodeHealthSet(at(startAt, intervalMs, 3), {
    includePi5Hub,
    degradeNodeB: true,
  });

  const steps: MockScenarioStep[] = [
    {
      id: "01-rfid-provider-location",
      title: "RFID identity and provider-style location",
      description:
        "Pi 4B node B reads the training tag and emits a coarse provider-style location fix.",
      events: [...onlineHealth, rfid],
      expectedRuntimeProducts: [
        "RfidEvent",
        "ProviderStyleLocationEvent",
        "LocationFix",
        "NodeHealth",
      ],
    },
    {
      id: "02-audio-corroboration",
      title: "Jetson USB microphone joins the track",
      description:
        "The Jetson contributes a USB microphone window so the event is no longer RFID-only.",
      events: [...onlineHealth, rfid, audio],
      expectedRuntimeProducts: [
        "AudioEvent",
        "RfidEvent",
        "ProviderStyleLocationEvent",
        "LocationFix",
        "InsightDraft",
      ],
    },
    {
      id: "03-jetson-visual-cue",
      title: "Jetson visual inference completes the quorum",
      description:
        "The Jetson Orin Nano contributes a camera detection, allowing local CASK fusion to produce a policy-gated cue while the Pi 5 remains a reserved hub path.",
      events: [...onlineHealth, rfid, audio, visual],
      expectedRuntimeProducts: [
        "DroneObservation",
        "ControlSourceEstimate",
        "CounterUasCue",
        "TrainingTagPlan",
        "CaskNodeInstruction",
        "ReplicationReport",
      ],
    },
  ];

  if (includeFailureStep) {
    steps.push({
      id: "04-node-loss-continuity",
      title: "Node loss after replication",
      description:
        "Node B is marked unreachable after contributing RFID evidence; the latest CASK snapshot should show degraded continuity while keeping replicated records available.",
      events: [...degradedHealth, rfid, audio, visual],
      expectedRuntimeProducts: [
        "MissionContinuityReport",
        "ReplicatedMissionLedger",
        "DegradedTrainingTagPlan",
        "DashboardSnapshot",
      ],
    });
  }

  return {
    id: "distributed-training-tag-mock",
    name: "Distributed CASK training tag mock",
    missionId,
    zoneId,
    subjectTagId,
    generatedAt: startAt.toISOString(),
    steps,
  };
}

export function latestMockScenarioEvents(options: MockScenarioOptions = {}): LiveSensorInput[] {
  const steps = buildCaskDemoMockScenario(options).steps;
  const latest = steps[steps.length - 1];
  return latest?.events ?? [];
}

function at(startAt: Date, intervalMs: number, index: number): string {
  return new Date(startAt.getTime() + intervalMs * index).toISOString();
}

function nodeHealthSet(
  observedAt: string,
  options: {
    includePi5Hub: boolean;
    degradeNodeB: boolean;
  },
): LiveSensorInput[] {
  const activePeerCount = options.includePi5Hub ? 3 : 2;
  return [
    {
      kind: "node_health",
      nodeId: "altiair-hub",
      observedAt,
      peerCount: options.includePi5Hub ? 3 : 0,
      queueDepth: options.includePi5Hub ? 0 : 99,
      cpuLoad: options.includePi5Hub ? 0.31 : 0,
      memoryUsedMb: options.includePi5Hub ? 1420 : 0,
      networkReachable: options.includePi5Hub,
      foundryReachable: false,
      modelStatus: options.includePi5Hub ? "ready" : "unavailable",
    },
    {
      kind: "node_health",
      nodeId: "altiair-node-a",
      observedAt,
      peerCount: options.degradeNodeB ? activePeerCount - 1 : activePeerCount,
      queueDepth: 1,
      cpuLoad: 0.42,
      memoryUsedMb: 980,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready",
    },
    {
      kind: "node_health",
      nodeId: "altiair-node-b",
      observedAt,
      peerCount: options.degradeNodeB ? 0 : activePeerCount,
      queueDepth: options.degradeNodeB ? 8 : 1,
      cpuLoad: options.degradeNodeB ? 0.91 : 0.47,
      memoryUsedMb: options.degradeNodeB ? 1860 : 1010,
      networkReachable: !options.degradeNodeB,
      foundryReachable: false,
      modelStatus: options.degradeNodeB ? "unavailable" : "ready",
    },
    {
      kind: "node_health",
      nodeId: "altiair-orin",
      observedAt,
      peerCount: options.degradeNodeB ? activePeerCount - 1 : activePeerCount,
      queueDepth: 0,
      cpuLoad: 0.36,
      memoryUsedMb: 2380,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready",
    },
  ];
}

function rfidRead(observedAt: string, zoneId: string, subjectTagId: string): LiveSensorInput {
  return {
    kind: "rfid_read",
    sourceNodeId: "altiair-node-b",
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: 0.81,
    policyState: "review_needed",
    isTestFixture: true,
    readerId: "node-b-rfid",
    tagId: subjectTagId,
    antennaId: "rfid-antenna-b",
    rssi: -41,
    readCount: 4,
    providerStyle: {
      sourceId: "l3harris-style-lte-mock-from-rfid-b",
      entityId: subjectTagId,
      precisionRadiusMeters: 35,
      expiresAt: new Date(Date.parse(observedAt) + 180_000).toISOString(),
      providerName: "L3Harris-style tactical LTE mock",
      emulationProfile: "l3harris_tactical_lte_mock",
      transport: "wifi_rfid",
      networkId: "altiair-private-lte-mock",
      cellId: "mock-cell-training-alpha",
      sectorId: "sector-a",
      accessPointId: "altiair-lan-ap",
      verificationMethod: "rfid_wifi_proximity",
      isSimulated: true,
      coordinates: {
        latitude: 37.78984,
        longitude: -122.40128,
      },
    },
  };
}

function audioWindow(observedAt: string, zoneId: string): LiveSensorInput {
  return {
    kind: "audio_window",
    sourceNodeId: "altiair-orin",
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: 0.48,
    policyState: "review_needed",
    isTestFixture: true,
    microphoneId: "jetson-usb-mic",
    vadWindowMs: [0, 2400],
    transcript: "small rotor tone near the training checkpoint, bearing uncertain",
    asrConfidence: 0.73,
    acousticClass: "small_rotor_noise",
  };
}

function cameraDetection(observedAt: string, zoneId: string): LiveSensorInput {
  return {
    kind: "camera_detection",
    sourceNodeId: "altiair-orin",
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: 0.92,
    policyState: "review_needed",
    isTestFixture: true,
    cameraId: "orin-camera-vision",
    detectionClass: "commercial_quadcopter",
    boundingRegion: {
      x: 0.42,
      y: 0.18,
      width: 0.16,
      height: 0.12,
    },
    frameRef: "mock://frames/orin-training-drone-0003",
    thumbnailRef: "mock://thumbnails/orin-training-drone-0003",
    retentionPolicy: "thumbnail_allowed",
  };
}

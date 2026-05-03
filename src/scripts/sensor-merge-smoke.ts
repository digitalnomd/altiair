import { buildCaskBundleFromLiveInputs, type LiveSensorInput } from "../sensors/liveMerge.js";

const observedAt = new Date("2026-05-03T12:00:00.000Z").toISOString();

const inputs: LiveSensorInput[] = [
  {
    kind: "rfid_read",
    sourceNodeId: "altiair-node-a",
    observedAt,
    zoneId: "training-zone-alpha",
    readerId: "rfid-reader-a",
    tagId: "training-tag-001",
    antennaId: "antenna-a",
    rssi: -48,
    readCount: 4,
    providerStyle: {
      sourceId: "arduino-rfid-kit-a",
      precisionRadiusMeters: 35,
    },
  },
  {
    kind: "audio_window",
    sourceNodeId: "altiair-node-b",
    observedAt,
    zoneId: "training-zone-alpha",
    microphoneId: "usb-mic-b",
    vadWindowMs: [0, 2800],
    acousticClass: "small_rotor_noise",
    confidence: 0.46,
  },
  {
    kind: "camera_detection",
    sourceNodeId: "altiair-orin",
    observedAt,
    zoneId: "training-zone-alpha",
    cameraId: "orin-camera-vision",
    detectionClass: "commercial_quadcopter",
    confidence: 0.58,
    retentionPolicy: "thumbnail_allowed",
    thumbnailRef: "local://media/thumbnails/live-smoke-drone.jpg",
  },
  {
    kind: "node_health",
    nodeId: "altiair-hub",
    observedAt,
    peerCount: 3,
    queueDepth: 1,
    cpuLoad: 0.41,
    memoryUsedMb: 1180,
    networkReachable: true,
    foundryReachable: false,
    modelStatus: "ready",
  },
];

const bundle = buildCaskBundleFromLiveInputs(inputs, {
  missionId: "mission-live-merge-smoke",
  sourceNodeId: "altiair-hub",
  createdAt: new Date(observedAt),
});

const kinds = new Set(bundle.sensorEvents.map((event) => event.kind));
for (const required of ["rfid", "provider_style_location", "audio", "camera"]) {
  if (!kinds.has(required as never)) {
    throw new Error(`Expected merged bundle to include ${required}.`);
  }
}
if (bundle.locationFixes.length === 0) {
  throw new Error("Expected RFID input to produce a provider-style location fix.");
}
if (bundle.droneObservations.length === 0) {
  throw new Error("Expected camera drone detection to produce a drone observation.");
}
if (bundle.counterUasCues.length === 0) {
  throw new Error("Expected fused camera/RFID evidence to produce a policy-gated cue.");
}
for (const health of bundle.nodeHealth) {
  if (health.modelStatus !== "ready") {
    throw new Error(`Expected ${health.nodeId} local LLM modelStatus ready.`);
  }
}

console.log(JSON.stringify(bundle, null, 2));

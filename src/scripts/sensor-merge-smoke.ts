import { buildCaskBundleFromLiveInputs, type LiveSensorInput } from "../sensors/liveMerge.js";

const observedAt = new Date("2026-05-03T12:00:00.000Z").toISOString();

const inputs: LiveSensorInput[] = [
  {
    kind: "rfid_read",
    sourceNodeId: "altiair-node-b",
    observedAt,
    zoneId: "training-zone-alpha",
    readerId: "node-b-rfid",
    tagId: "training-tag-001",
    antennaId: "rfid-antenna-b",
    rssi: -48,
    readCount: 4,
    providerStyle: {
      sourceId: "l3harris-style-lte-mock-from-rfid-b",
      precisionRadiusMeters: 35,
      providerName: "L3Harris-style tactical LTE mock",
      emulationProfile: "l3harris_tactical_lte_mock",
      transport: "wifi_rfid",
      networkId: "altiair-private-lte-mock",
      cellId: "mock-cell-training-alpha",
      sectorId: "sector-a",
      accessPointId: "altiair-lan-ap",
      verificationMethod: "rfid_wifi_proximity",
      isSimulated: true,
    },
  },
  {
    kind: "audio_window",
    sourceNodeId: "altiair-orin",
    observedAt,
    zoneId: "training-zone-alpha",
    microphoneId: "jetson-usb-mic",
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
const providerEvent = bundle.sensorEvents.find((event) => event.kind === "provider_style_location");
if (providerEvent?.providerEnvelope.emulationProfile !== "l3harris_tactical_lte_mock") {
  throw new Error("Expected provider-style event to carry the L3Harris-style mock LTE envelope.");
}
if (bundle.locationFixes[0]?.providerEnvelope?.transport !== "wifi_rfid") {
  throw new Error("Expected location fix to preserve the RFID/Wi-Fi proximity transport envelope.");
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

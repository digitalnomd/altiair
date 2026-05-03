import type { LiveSensorInput } from "../sensors/liveMerge.js";

interface OpenSkyResponse {
  time?: number;
  states?: unknown[][];
}

interface OpenSkyTrack {
  icao24: string;
  callsign?: string;
  originCountry?: string;
  longitude: number;
  latitude: number;
  altitudeMeters?: number;
  velocityMetersPerSecond?: number;
  headingDegrees?: number;
  lastContact?: number;
}

const postUrl = argValue("--post-url") ?? process.env.ALTIAIR_SENSOR_POST_URL;
if (postUrl === undefined) {
  throw new Error("--post-url or ALTIAIR_SENSOR_POST_URL is required.");
}

const missionId = argValue("--mission") ?? process.env.ALTIAIR_MISSION_ID ?? "mission-live-edge";
const zoneId = argValue("--zone-id") ?? process.env.ALTIAIR_ZONE_ID ?? "training-zone-alpha";
const cameraNodeId = argValue("--camera-node") ?? process.env.ALTIAIR_HAWKEYE_CAMERA_NODE_ID ?? "altiair-orin";
const microphoneNodeId = argValue("--microphone-node") ?? process.env.ALTIAIR_HAWKEYE_MICROPHONE_NODE_ID ?? "altiair-orin";
const rfidNodeId = argValue("--rfid-node") ?? process.env.ALTIAIR_HAWKEYE_RFID_NODE_ID ?? "altiair-node-b";
const includePi5Hub = hasFlag("--include-pi5");
const intervalMs = numberArg("--interval-ms", Number(process.env.ALTIAIR_HAWKEYE_INTERVAL_MS ?? 10_000));
const once = hasFlag("--once");
const source = argValue("--source") ?? process.env.ALTIAIR_HAWKEYE_SOURCE ?? "auto";
const openSkyUrl = argValue("--opensky-url") ?? process.env.ALTIAIR_OPENSKY_URL ?? defaultOpenSkyUrl();

let cycle = 0;
while (true) {
  const events = await buildEvents();
  const response = await fetch(postUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorizationHeader(),
    },
    body: JSON.stringify({
      scenarioId: "hawkeye-style-live-feed",
      stepId: "hawkeye-feed",
      cycle,
      missionId,
      sourceNodeId: cameraNodeId,
      bundleId: `bundle-${missionId}-hawkeye-${Date.now()}`,
      createdAt: new Date().toISOString(),
      events,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${postUrl} failed with HTTP ${response.status}: ${text}`);
  }
  console.log(text);
  cycle += 1;
  if (once) {
    break;
  }
  await sleep(intervalMs);
}

async function buildEvents(): Promise<LiveSensorInput[]> {
  const observedAt = new Date().toISOString();
  const track = source === "mock" ? undefined : await fetchOpenSkyTrack().catch(() => undefined);
  return [
    ...nodeHealth(observedAt),
    rfidRead(observedAt),
    audioWindow(observedAt),
    cameraDetection(observedAt, track),
  ];
}

async function fetchOpenSkyTrack(): Promise<OpenSkyTrack | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(openSkyUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "altiair-cask-edge-demo/0.1",
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const body = await response.json() as OpenSkyResponse;
    const states = Array.isArray(body.states) ? body.states : [];
    const tracks = states.map(parseOpenSkyState).filter((track): track is OpenSkyTrack => track !== undefined);
    return tracks.sort((left, right) =>
      (left.altitudeMeters ?? Number.POSITIVE_INFINITY) - (right.altitudeMeters ?? Number.POSITIVE_INFINITY)
    )[0];
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenSkyState(state: unknown[]): OpenSkyTrack | undefined {
  const icao24 = stringAt(state, 0);
  const longitude = numberAt(state, 5);
  const latitude = numberAt(state, 6);
  const onGround = state[8] === true;
  if (icao24 === undefined || longitude === undefined || latitude === undefined || onGround) {
    return undefined;
  }
  return {
    icao24,
    callsign: stringAt(state, 1)?.trim() || undefined,
    originCountry: stringAt(state, 2),
    longitude,
    latitude,
    altitudeMeters: numberAt(state, 13) ?? numberAt(state, 7),
    velocityMetersPerSecond: numberAt(state, 9),
    headingDegrees: numberAt(state, 10),
    lastContact: numberAt(state, 4),
  };
}

function nodeHealth(observedAt: string): LiveSensorInput[] {
  const currentPeerCount = includePi5Hub ? 3 : 2;
  return [
    {
      kind: "node_health",
      nodeId: "altiair-hub",
      observedAt,
      peerCount: includePi5Hub ? 3 : 0,
      queueDepth: includePi5Hub ? 1 : 99,
      cpuLoad: includePi5Hub ? 0.36 : 0,
      memoryUsedMb: includePi5Hub ? 1600 : 0,
      networkReachable: includePi5Hub,
      foundryReachable: false,
      modelStatus: includePi5Hub ? "ready" : "unavailable",
    },
    {
      kind: "node_health",
      nodeId: "altiair-node-a",
      observedAt,
      peerCount: currentPeerCount,
      queueDepth: 1,
      cpuLoad: 0.34,
      memoryUsedMb: 820,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready",
    },
    {
      kind: "node_health",
      nodeId: "altiair-node-b",
      observedAt,
      peerCount: currentPeerCount,
      queueDepth: 1,
      cpuLoad: 0.39,
      memoryUsedMb: 860,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready",
    },
    {
      kind: "node_health",
      nodeId: "altiair-orin",
      observedAt,
      peerCount: currentPeerCount,
      queueDepth: 0,
      cpuLoad: 0.41,
      memoryUsedMb: 2400,
      networkReachable: true,
      foundryReachable: false,
      modelStatus: "ready",
    },
  ];
}

function rfidRead(observedAt: string): LiveSensorInput {
  return {
    kind: "rfid_read",
    sourceNodeId: rfidNodeId,
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: 0.81,
    policyState: "review_needed",
    isTestFixture: true,
    readerId: "node-b-rfid",
    tagId: "training-tag-001",
    antennaId: "rfid-antenna-b",
    rssi: -41,
    readCount: 4,
    providerStyle: {
      sourceId: "l3harris-style-lte-mock-from-rfid-b",
      entityId: "training-tag-001",
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

function audioWindow(observedAt: string): LiveSensorInput {
  return {
    kind: "audio_window",
    sourceNodeId: microphoneNodeId,
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: 0.54,
    policyState: "review_needed",
    isTestFixture: true,
    microphoneId: "jetson-usb-mic",
    vadWindowMs: [0, 3000],
    transcript: "USB microphone or mock acoustic window indicates activity near the training checkpoint.",
    asrConfidence: 0.62,
    acousticClass: "ambient_activity",
  };
}

function cameraDetection(observedAt: string, track: OpenSkyTrack | undefined): LiveSensorInput {
  const metadata = track === undefined
    ? {
        source: "deterministic_hawkeye_mock",
        note: "No online air track was available; using local fallback track.",
      }
    : {
        source: "opensky_states_all",
        icao24: track.icao24,
        callsign: track.callsign,
        originCountry: track.originCountry,
        latitude: track.latitude,
        longitude: track.longitude,
        altitudeMeters: track.altitudeMeters,
        velocityMetersPerSecond: track.velocityMetersPerSecond,
        headingDegrees: track.headingDegrees,
        lastContact: track.lastContact,
      };

  return {
    kind: "camera_detection",
    sourceNodeId: cameraNodeId,
    observedAt,
    receivedAt: observedAt,
    zoneId,
    confidence: track === undefined ? 0.72 : 0.78,
    policyState: "review_needed",
    isTestFixture: true,
    cameraId: cameraNodeId === "altiair-hub" ? "pi5-camera" : "hawkeye-virtual-feed",
    detectionClass: "uas_hawkeye_public_air_track_mock",
    frameRef: track === undefined ? "mock://hawkeye/local-track" : `opensky://state/${track.icao24}`,
    thumbnailRef: "mock://thumbnails/hawkeye-track",
    retentionPolicy: "metadata_only",
    metadata,
  };
}

function defaultOpenSkyUrl(): string {
  const lamin = process.env.ALTIAIR_OPENSKY_LAMIN ?? "37.60";
  const lomin = process.env.ALTIAIR_OPENSKY_LOMIN ?? "-122.60";
  const lamax = process.env.ALTIAIR_OPENSKY_LAMAX ?? "37.95";
  const lomax = process.env.ALTIAIR_OPENSKY_LOMAX ?? "-122.20";
  return `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
}

function authorizationHeader(): Record<string, string> {
  const token = process.env.ALTIAIR_API_TOKEN;
  if (token === undefined || token.trim() === "") {
    return {};
  }
  return {
    authorization: `Bearer ${token}`,
  };
}

function stringAt(values: unknown[], index: number): string | undefined {
  const value = values[index];
  return typeof value === "string" ? value : undefined;
}

function numberAt(values: unknown[], index: number): number | undefined {
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberArg(name: string, fallback: number): number {
  const value = argValue(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

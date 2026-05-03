import { buildCaskDemoMockScenario } from "../mock/caskDemoScenario.js";

const baseUrl = stripTrailingSlash(argValue("--base-url") ?? process.env.ALTIAIR_DEMO_BASE_URL ?? "http://127.0.0.1:8080");
const missionId = argValue("--mission") ?? process.env.ALTIAIR_MISSION_ID ?? "mission-live-edge";
const includePi5Hub = hasFlag("--include-pi5");
const includeFailureStep = hasFlag("--include-failure-step");
const skipUpload = hasFlag("--skip-upload");

const scenario = buildCaskDemoMockScenario({
  missionId,
  startAt: new Date(),
  includePi5Hub,
  includeFailureStep,
});

const initialHealth = scenario.steps[0]?.events.filter((event) => event.kind === "node_health") ?? [];
if (initialHealth.length > 0) {
  await postJson("/sensor-events", {
    scenarioId: scenario.id,
    stepId: "00-current-node-health",
    missionId,
    sourceNodeId: "altiair-orin",
    bundleId: `bundle-${missionId}-current-node-health-${Date.now()}`,
    createdAt: latestObservedAt(initialHealth) ?? new Date().toISOString(),
    events: initialHealth,
  });
}

await postJson("/mission/deploy", {
  missionId,
  title: "CASK controlled training tag",
  missionText:
    "Deploy the Jetson and Raspberry Pi CASK mesh to collect RFID, USB microphone, Hawkeye-style visual/track, and node-health evidence for a controlled training tag in training-zone-alpha. Keep the cue policy-gated, replicated locally, and queued for Foundry/CASK writeback when a gateway is available.",
  objectiveType: "controlled_training_tag",
  authorizedZoneId: "training-zone-alpha",
  subjectRef: "training-tag-001",
  requiredSensorKinds: ["rfid", "audio", "camera", "node_health"],
  operatorAuthorized: true,
  requestedBy: "Sarah Hatcher",
});

const replaySummaries: unknown[] = [];
for (const step of scenario.steps) {
  const accepted = await postJson("/sensor-events", {
    scenarioId: scenario.id,
    stepId: step.id,
    missionId,
    sourceNodeId: "altiair-orin",
    bundleId: `bundle-${missionId}-${step.id}-${Date.now()}`,
    createdAt: latestObservedAt(step.events) ?? new Date().toISOString(),
    events: step.events,
  });
  replaySummaries.push({
    stepId: step.id,
    accepted: accepted.accepted,
    bundleId: accepted.bundleId,
    stream: accepted.stream,
    localLlm: accepted.localLlm,
  });
}

const foundrySync = skipUpload ? null : await postJson("/foundry/upload", {});
const [dashboard, stream, coordinator, insight, deployment] = await Promise.all([
  getJson("/dashboard"),
  getJson("/stream/status"),
  getJson("/coordinator/latest"),
  getJson("/insights/latest"),
  getJson("/mission/deployment/latest"),
]);

console.log(JSON.stringify({
  ready: true,
  baseUrl,
  missionId,
  currentMesh: {
    jetson: "altiair-orin",
    nodeA: "altiair-node-a",
    nodeB: "altiair-node-b",
    pi5: includePi5Hub ? "included" : "reserved/offline",
  },
  replaySummaries,
  foundrySync,
  checks: {
    dashboardNode: dashboard?.nodeApi?.health?.nodeId,
    streamTotalRecords: stream?.totalRecords,
    coordinatorLeader: coordinator?.election?.leaderId,
    localLlmModel: insight?.model,
    deploymentState: deployment?.state,
  },
}, null, 2));

async function postJson(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorizationHeader(),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} returned ${response.status}: ${text}`);
  }
  return text.length > 0 ? JSON.parse(text) : {};
}

async function getJson(path: string): Promise<any> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authorizationHeader(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}: ${text}`);
  }
  return JSON.parse(text);
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

function latestObservedAt(events: Array<{ observedAt?: string }>): string | undefined {
  const timestamps = events
    .map((event) => event.observedAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length === 0) {
    return undefined;
  }
  return new Date(Math.max(...timestamps)).toISOString();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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

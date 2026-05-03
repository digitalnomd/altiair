import { buildCaskDemoMockScenario } from "../mock/caskDemoScenario.js";

interface TargetNode {
  id: string;
  label: string;
  url: string;
  required: boolean;
}

interface EndpointResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

interface PeerReplicationResult {
  nodeId: string;
  url: string;
  posted: boolean;
  accepted?: boolean;
  bundleId?: string;
  localLlmMode?: string;
  localLlmStatus?: string;
  insightPolicyState?: string;
  insightRecommendedNextCheckCount?: number;
  ledgerStoredRecordCount?: number;
  streamTotalRecords?: number;
  error?: string;
}

const timeoutMs = numberArg("--timeout-ms", Number(process.env.ALTIAIR_INTEGRATION_TIMEOUT_MS ?? 5_000));
const missionId = argValue("--mission") ?? process.env.ALTIAIR_MISSION_ID ?? "mission-live-edge";
const includePi5 = hasFlag("--include-pi5");
const seed = !hasFlag("--skip-seed");
const replicateToPeers = !hasFlag("--skip-peer-replication");
const uploadFoundry = hasFlag("--upload");
const requiredLlmMode = argValue("--require-llm-mode") ?? process.env.ALTIAIR_REQUIRE_LLM_MODE;

const jetson: TargetNode = {
  id: "altiair-orin",
  label: "jetson",
  url: stripTrailingSlash(argValue("--jetson-url") ?? process.env.ALTIAIR_JETSON_URL ?? "http://127.0.0.1:8080"),
  required: true,
};

const nodeA: TargetNode = {
  id: "altiair-node-a",
  label: "node-a",
  url: stripTrailingSlash(argValue("--node-a-url") ?? process.env.ALTIAIR_NODE_A_URL ?? "http://192.168.42.11:8081"),
  required: true,
};

const nodeB: TargetNode = {
  id: "altiair-node-b",
  label: "node-b",
  url: stripTrailingSlash(argValue("--node-b-url") ?? process.env.ALTIAIR_NODE_B_URL ?? "http://192.168.42.12:8082"),
  required: true,
};

const pi5: TargetNode = {
  id: "altiair-hub",
  label: "pi5",
  url: stripTrailingSlash(argValue("--pi5-url") ?? process.env.ALTIAIR_PI5_URL ?? "http://192.168.42.10:8080"),
  required: includePi5,
};

const requiredPeers = [nodeA, nodeB];
const healthTargets = includePi5 ? [jetson, nodeA, nodeB, pi5] : [jetson, nodeA, nodeB];
const optionalTargets = includePi5 ? [] : [pi5];
const failures: string[] = [];

const health = Object.fromEntries(
  await Promise.all(
    [...healthTargets, ...optionalTargets].map(async (target) => [target.id, await getJson(`${target.url}/health`)]),
  ),
) as Record<string, EndpointResult>;

for (const target of healthTargets) {
  requireEndpointOk(health[target.id], `${target.id} /health`);
  const observedNodeId = stringPath(health[target.id]?.body, ["nodeId"]);
  if (observedNodeId !== undefined && observedNodeId !== target.id) {
    failures.push(`${target.id} /health returned nodeId=${observedNodeId}`);
  }
}

const pi5State = health[pi5.id]?.ok
  ? includePi5 ? "present-required" : "present-early"
  : includePi5 ? "missing-required" : "reserved/offline";
if (includePi5 && !health[pi5.id]?.ok) {
  failures.push("Pi 5 was required but is not reachable.");
}

const replaySummaries: unknown[] = [];
if (seed) {
  await postRequired(`${jetson.url}/mission/deploy`, {
    missionId,
    title: "CASK controlled training tag",
    missionText:
      "Deploy the Jetson and Raspberry Pi CASK mesh to collect RFID, USB microphone, Hawkeye-style visual/track, and node-health evidence for a controlled training tag in training-zone-alpha. Keep the cue policy-gated, locally triaged by each node LLM, replicated locally, and queued for Foundry/CASK writeback when a gateway is available.",
    objectiveType: "controlled_training_tag",
    authorizedZoneId: "training-zone-alpha",
    subjectRef: "training-tag-001",
    requiredSensorKinds: ["rfid", "audio", "camera", "node_health"],
    operatorAuthorized: true,
    requestedBy: "Altiair demo operator",
  }, "mission deploy");

  const scenario = buildCaskDemoMockScenario({
    missionId,
    startAt: new Date(),
    includePi5Hub: includePi5,
  });

  for (const step of scenario.steps) {
    const accepted = await postRequired(`${jetson.url}/sensor-events`, {
      scenarioId: scenario.id,
      stepId: step.id,
      missionId,
      sourceNodeId: "altiair-orin",
      bundleId: `bundle-${missionId}-${step.id}-${Date.now()}`,
      createdAt: latestObservedAt(step.events) ?? new Date().toISOString(),
      events: step.events,
    }, `sensor step ${step.id}`);
    const localLlmMode = stringPath(accepted, ["localLlm", "mode"]);
    const localLlmStatus = stringPath(accepted, ["localLlm", "status"]);
    replaySummaries.push({
      stepId: step.id,
      accepted: booleanPath(accepted, ["accepted"]),
      bundleId: stringPath(accepted, ["bundleId"]),
      localLlmMode,
      localLlmStatus,
      streamAppendedRecords: numberPath(accepted, ["stream", "appendedRecords"]),
    });
    if (localLlmStatus !== "ready") {
      failures.push(`local LLM did not return ready for ${step.id}`);
    }
    if (requiredLlmMode !== undefined && localLlmMode !== requiredLlmMode) {
      failures.push(`local LLM mode for ${step.id} was ${localLlmMode}, expected ${requiredLlmMode}`);
    }
  }

  if (uploadFoundry) {
    await postRequired(`${jetson.url}/foundry/upload`, {}, "foundry upload");
  }
}

const [
  dashboard,
  stream,
  coordinator,
  insight,
  deployment,
  replication,
  continuity,
  gossip,
  pendingBundles,
  foundrySync,
] = await Promise.all([
  getJson(`${jetson.url}/dashboard`),
  getJson(`${jetson.url}/stream/status`),
  getJson(`${jetson.url}/coordinator/latest`),
  getJson(`${jetson.url}/insights/latest`),
  getJson(`${jetson.url}/mission/deployment/latest`),
  getJson(`${jetson.url}/replication/latest`),
  getJson(`${jetson.url}/mission-continuity`),
  getJson(`${jetson.url}/gossip/world`),
  getJson(`${jetson.url}/bundles/pending`),
  getJson(`${jetson.url}/foundry/sync/latest`),
]);

for (const [label, result] of Object.entries({
  dashboard,
  stream,
  coordinator,
  insight,
  deployment,
  replication,
  continuity,
  gossip,
  pendingBundles,
})) {
  requireEndpointOk(result, `jetson ${label}`);
}

const latestBundle = latestPendingBundle(pendingBundles.body);
if (latestBundle === undefined) {
  failures.push("Jetson has no pending bundle to replicate.");
}

const peerReplication = latestBundle !== undefined && replicateToPeers
  ? await Promise.all(requiredPeers.map((peer) => replicateBundleToPeer(peer, latestBundle)))
  : [];

for (const result of peerReplication) {
  if (result.error !== undefined) {
    failures.push(`${result.nodeId} peer replication failed: ${result.error}`);
    continue;
  }
  if (result.accepted !== true) {
    failures.push(`${result.nodeId} did not accept replicated bundle.`);
  }
  if (result.localLlmStatus !== "ready") {
    failures.push(`${result.nodeId} local LLM did not return ready.`);
  }
  if (requiredLlmMode !== undefined && result.localLlmMode !== requiredLlmMode) {
    failures.push(`${result.nodeId} local LLM mode was ${result.localLlmMode}, expected ${requiredLlmMode}`);
  }
  if ((result.insightRecommendedNextCheckCount ?? 0) < 1) {
    failures.push(`${result.nodeId} local insight has no recommended next checks.`);
  }
  if ((result.ledgerStoredRecordCount ?? 0) < 1) {
    failures.push(`${result.nodeId} ledger did not report stored records after replication.`);
  }
}

const replicationRequiredNodeIds = stringArrayPath(replication.body, ["requiredReplicaNodeIds"]);
for (const peer of [jetson, nodeA, nodeB]) {
  if (!replicationRequiredNodeIds.includes(peer.id)) {
    failures.push(`replication report does not include reachable node ${peer.id}`);
  }
}
if (includePi5 && !replicationRequiredNodeIds.includes(pi5.id)) {
  failures.push("replication report does not include required Pi 5.");
}

const insightPolicyState = stringPath(insight.body, ["policyState"]);
const recommendedNextCheckCount = arrayPath(insight.body, ["recommendedNextChecks"]).length;
if (insightPolicyState === undefined) {
  failures.push("local LLM insight is missing policyState.");
}
if (recommendedNextCheckCount < 1) {
  failures.push("local LLM insight has no recommended next checks.");
}

const output = {
  ready: failures.length === 0,
  missionId,
  seed,
  peerReplicationEnabled: replicateToPeers,
  foundryUploadAttempted: uploadFoundry,
  targets: {
    jetson: summarizeHealth(health[jetson.id]),
    nodeA: summarizeHealth(health[nodeA.id]),
    nodeB: summarizeHealth(health[nodeB.id]),
    pi5: {
      state: pi5State,
      ...summarizeHealthObject(health[pi5.id]),
    },
  },
  runtimeProducts: {
    latestBundleId: latestBundleId(pendingBundles.body),
    replaySummaries,
    streamTotalRecords: numberPath(stream.body, ["totalRecords"]),
    coordinatorLeader: stringPath(coordinator.body, ["election", "leaderId"]),
    coordinatorAuthority: stringPath(coordinator.body, ["authority", "state"]),
    localLlmModel: stringPath(insight.body, ["model"]),
    localLlmPolicyState: insightPolicyState,
    localLlmRecommendedNextCheckCount: recommendedNextCheckCount,
    deploymentState: stringPath(deployment.body, ["state"]),
    replicationAllReachable: booleanPath(replication.body, ["allReachableNodesHaveAllRecords"]),
    replicationSurvivableNodeLoss: booleanPath(replication.body, ["survivableNodeLoss"]),
    replicationRequiredNodeIds,
    continuityState: stringPath(continuity.body, ["state"]) ?? stringPath(continuity.body, ["continuityState"]),
    gossipNodeCount: arrayLengthPath(gossip.body, ["nodes"]),
    foundrySyncStatus: foundrySync.ok
      ? stringPath(foundrySync.body, ["ack", "status"]) ?? stringPath(foundrySync.body, ["status"])
      : "not-uploaded",
  },
  peerReplication,
  failures,
};

console.log(JSON.stringify(output, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}

async function replicateBundleToPeer(peer: TargetNode, bundle: unknown): Promise<PeerReplicationResult> {
  const posted = await postJson(`${peer.url}/bundles`, bundle);
  if (!posted.ok) {
    return {
      nodeId: peer.id,
      url: peer.url,
      posted: false,
      error: posted.error ?? `HTTP ${posted.status}`,
    };
  }

  const [ledger, peerStream, insight] = await Promise.all([
    getJson(`${peer.url}/ledger`),
    getJson(`${peer.url}/stream/status`),
    getJson(`${peer.url}/insights/latest`),
  ]);

  return {
    nodeId: peer.id,
    url: peer.url,
    posted: true,
    accepted: booleanPath(posted.body, ["accepted"]),
    bundleId: stringPath(posted.body, ["bundleId"]),
    localLlmMode: stringPath(posted.body, ["localLlm", "mode"]),
    localLlmStatus: stringPath(posted.body, ["localLlm", "status"]),
    insightPolicyState: stringPath(insight.body, ["policyState"]),
    insightRecommendedNextCheckCount: arrayPath(insight.body, ["recommendedNextChecks"]).length,
    ledgerStoredRecordCount: numberPath(ledger.body, ["storedRecordCount"]),
    streamTotalRecords: numberPath(peerStream.body, ["totalRecords"]),
    error: ledger.ok && peerStream.ok && insight.ok
      ? undefined
      : `${ledger.error ?? ""} ${peerStream.error ?? ""} ${insight.error ?? ""}`.trim(),
  };
}

async function postRequired(url: string, body: unknown, label: string): Promise<unknown> {
  const result = await postJson(url, body);
  if (!result.ok) {
    failures.push(`${label} failed: ${result.error ?? `HTTP ${result.status}`}`);
    return {};
  }
  return result.body ?? {};
}

async function getJson(url: string): Promise<EndpointResult> {
  return requestJson("GET", url);
}

async function postJson(url: string, body: unknown): Promise<EndpointResult> {
  return requestJson("POST", url, body);
}

async function requestJson(method: "GET" | "POST", url: string, body?: unknown): Promise<EndpointResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...authorizationHeader(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text.length > 0 ? safeJson(text) : {};
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: parsed,
        error: `${method} ${url} returned ${response.status}: ${text.slice(0, 300)}`,
      };
    }
    return {
      ok: true,
      status: response.status,
      body: parsed,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown request failure";
    return {
      ok: false,
      error: `${method} ${url} failed: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requireEndpointOk(result: EndpointResult | undefined, label: string): void {
  if (result?.ok !== true) {
    failures.push(`${label} unavailable: ${result?.error ?? "no result"}`);
  }
}

function latestPendingBundle(value: unknown): unknown | undefined {
  const bundles = arrayPath(value, ["bundles"]);
  return bundles[bundles.length - 1];
}

function latestBundleId(value: unknown): string | undefined {
  const bundle = latestPendingBundle(value);
  return stringPath(bundle, ["id"]);
}

function summarizeHealth(result: EndpointResult | undefined): unknown {
  return summarizeHealthObject(result);
}

function summarizeHealthObject(result: EndpointResult | undefined): Record<string, unknown> {
  if (result?.ok !== true) {
    return {
      ok: false,
      error: result?.error,
    };
  }
  return {
    ok: true,
    nodeId: stringPath(result.body, ["nodeId"]),
    nodeRole: stringPath(result.body, ["nodeRole"]),
    peerCount: numberPath(result.body, ["peerCount"]),
    queueDepth: numberPath(result.body, ["queueDepth"]),
    modelStatus: stringPath(result.body, ["modelStatus"]),
  };
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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function arrayLengthPath(value: unknown, path: string[]): number | undefined {
  const length = arrayPath(value, path).length;
  return length === 0 ? undefined : length;
}

function stringArrayPath(value: unknown, path: string[]): string[] {
  return arrayPath(value, path).filter((entry): entry is string => typeof entry === "string");
}

function arrayPath(value: unknown, path: string[]): unknown[] {
  const target = valuePath(value, path);
  return Array.isArray(target) ? target : [];
}

function stringPath(value: unknown, path: string[]): string | undefined {
  const target = valuePath(value, path);
  return typeof target === "string" ? target : undefined;
}

function numberPath(value: unknown, path: string[]): number | undefined {
  const target = valuePath(value, path);
  return typeof target === "number" && Number.isFinite(target) ? target : undefined;
}

function booleanPath(value: unknown, path: string[]): boolean | undefined {
  const target = valuePath(value, path);
  return typeof target === "boolean" ? target : undefined;
}

function valuePath(value: unknown, path: string[]): unknown {
  let cursor = value;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function numberArg(name: string, fallback: number): number {
  const value = argValue(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../config.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import {
  assessMissionContinuity,
  decideCongestion,
  selectGateway,
} from "../mesh/gatewaySelection.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";
import { buildReplicationReport } from "../mesh/replication.js";
import { buildCaskBundleFromLiveInputs, type LiveSensorInput } from "../sensors/liveMerge.js";
import { createLocalInsightClient, type LocalInsightClient } from "../llm/localInsight.js";
import type { CaskBundle, InsightDraft, NodeHealth, PolicyState } from "../cask/types.js";
import type { TrainingTagPlan } from "../cask/trainingTag.js";
import type { NodeDescriptor, PeerObservation, ReplicationReport } from "../mesh/types.js";

interface RuntimeState {
  node: NodeDescriptor;
  observations: PeerObservation[];
  bundles: CaskBundle[];
  insights: InsightDraft[];
  tagPlans: TrainingTagPlan[];
  replicationReports: ReplicationReport[];
  insightClient: LocalInsightClient;
  llmMode: string;
  llmModel: string;
  startedAt: number;
  currentGatewayId?: string;
  apiToken?: string;
}

const config = loadConfig();
const nodeId = argValue("--node") ?? process.env.ALTIAIR_NODE_ID ?? "altiair-hub";
const node = defaultDdilMeshTopology.nodes.find((candidate) => candidate.id === nodeId);
if (node === undefined) {
  throw new Error(`Unknown node "${nodeId}". Run npm run mesh:plan -- --format summary for valid ids.`);
}

const port = Number(argValue("--port") ?? process.env.ALTIAIR_API_PORT ?? node.apiPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid API port: ${port}`);
}

const host = argValue("--host") ?? process.env.ALTIAIR_API_HOST ?? "0.0.0.0";
const apiToken = process.env.ALTIAIR_API_TOKEN;
const corsOrigin = process.env.ALTIAIR_CORS_ORIGIN;

const state: RuntimeState = {
  node,
  observations: nominalMeshObservations,
  bundles: [],
  insights: [],
  tagPlans: [],
  replicationReports: [],
  insightClient: createLocalInsightClient(config.llm),
  llmMode: config.llm.mode,
  llmModel: config.llm.model,
  startedAt: Date.now(),
  currentGatewayId: process.env.ALTIAIR_CURRENT_GATEWAY_ID,
  apiToken,
};

const server = createServer((request, response) => {
  void handleRequest(request, response, state).catch((error: unknown) => {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown server error.",
    });
  });
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify(
      {
        nodeId: state.node.id,
        hostname: state.node.hostname,
        listen: `${host}:${port}`,
        overlayAddress: state.node.overlayAddress,
        localLlm: {
          mode: state.llmMode,
          model: state.llmModel,
        },
        dashboard: "/dashboard",
        frontendCors: corsOrigin === undefined ? "disabled" : corsOrigin,
        protectedRoutes: apiToken === undefined ? "disabled" : "bearer",
      },
      null,
      2,
    ),
  );
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: RuntimeState,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    writeCorsPreflight(response);
    return;
  }

  if (request.method === "GET" && path === "/health") {
    writeJson(response, 200, buildHealth(state));
    return;
  }

  if (!isAuthorized(request, state)) {
    writeJson(response, 401, {
      error: "Unauthorized.",
      message: "Protected route requires Authorization: Bearer <token>.",
    });
    return;
  }

  if (request.method === "GET" && path === "/dashboard") {
    writeJson(response, 200, buildDashboardSnapshot(state));
    return;
  }

  if (request.method === "GET" && path === "/topology") {
    writeJson(response, 200, defaultDdilMeshTopology);
    return;
  }

  if (request.method === "GET" && path === "/peers") {
    writeJson(response, 200, {
      nodeId: state.node.id,
      peers: defaultDdilMeshTopology.nodes
        .filter((peer) => peer.id !== state.node.id)
        .map((peer) => ({
          ...peer,
          observation: state.observations.find((observation) => observation.nodeId === peer.id),
        })),
    });
    return;
  }

  if (request.method === "GET" && path === "/gateway") {
    const decision = selectGateway(defaultDdilMeshTopology, state.observations, {
      currentGatewayId: state.currentGatewayId,
    });
    state.currentGatewayId = decision.selectedGatewayId ?? state.currentGatewayId;
    writeJson(response, 200, decision);
    return;
  }

  if (request.method === "GET" && path === "/mission-continuity") {
    writeJson(
      response,
      200,
      assessMissionContinuity(defaultDdilMeshTopology, state.observations, state.currentGatewayId),
    );
    return;
  }

  if (request.method === "GET" && path === "/congestion") {
    const gatewayDecision = selectGateway(defaultDdilMeshTopology, state.observations, {
      currentGatewayId: state.currentGatewayId,
    });
    const gatewayObservation = state.observations.find(
      (observation) => observation.nodeId === gatewayDecision.selectedGatewayId,
    );
    if (gatewayObservation === undefined) {
      writeJson(response, 503, {
        gatewayDecision,
        congestion: null,
        message: "No reachable gateway; keep local queue active.",
      });
      return;
    }

    writeJson(response, 200, {
      gatewayDecision,
      congestion: decideCongestion(
        defaultDdilMeshTopology,
        gatewayObservation,
        numberQuery(url, "bundle_size_bytes", 0),
        numberQuery(url, "duplicate_probability", 0),
        policyQuery(url),
      ),
    });
    return;
  }

  if (request.method === "GET" && path === "/replication") {
    writeJson(response, 200, {
      nodeId: state.node.id,
      policy: defaultDdilMeshTopology.policy.replication,
      reportCount: state.replicationReports.length,
      latest: summarizeReplicationReport(latestReplicationReport(state)),
    });
    return;
  }

  if (request.method === "GET" && path === "/replication/latest") {
    const latestReport = latestReplicationReport(state);
    if (latestReport === undefined) {
      writeJson(response, 404, {
        error: "No replicated bundles.",
        message: "POST /bundles first, then read /replication/latest.",
      });
      return;
    }

    writeJson(response, 200, latestReport);
    return;
  }

  if (request.method === "GET" && path === "/ledger") {
    writeJson(response, 200, buildLocalLedgerView(state));
    return;
  }

  if (request.method === "GET" && path === "/bundles/pending") {
    writeJson(response, 200, {
      nodeId: state.node.id,
      count: state.bundles.length,
      bundles: state.bundles,
    });
    return;
  }

  if (request.method === "POST" && path === "/bundles") {
    if (!isJsonRequest(request)) {
      writeJson(response, 415, {
        error: "Unsupported media type.",
        message: "POST /bundles requires content-type application/json.",
      });
      return;
    }

    const rawBody = await readBody(request, defaultDdilMeshTopology.policy.maxBundleSizeBytes);
    const bundle = parseBundleResponse(rawBody, response);
    if (bundle === undefined) {
      return;
    }
    await acceptBundleResponse(state, bundle, Buffer.byteLength(rawBody), response);
    return;
  }

  if (request.method === "POST" && path === "/sensor-events") {
    if (!isJsonRequest(request)) {
      writeJson(response, 415, {
        error: "Unsupported media type.",
        message: "POST /sensor-events requires content-type application/json.",
      });
      return;
    }

    const rawBody = await readBody(request, defaultDdilMeshTopology.policy.maxBundleSizeBytes);
    const inputs = parseLiveSensorInputsResponse(rawBody, response);
    if (inputs === undefined) {
      return;
    }

    const bundle = buildCaskBundleFromLiveInputs(inputs, {
      missionId: process.env.ALTIAIR_MISSION_ID,
      sourceNodeId: state.node.id,
    });
    await acceptBundleResponse(state, bundle, Buffer.byteLength(rawBody), response);
    return;
  }

  if (request.method === "GET" && path === "/insights/latest") {
    const latestInsight = latestInsightDraft(state);
    if (latestInsight === undefined) {
      writeJson(response, 404, {
        error: "No local insights.",
        message: "POST /sensor-events or POST /bundles first, then read /insights/latest.",
      });
      return;
    }

    writeJson(response, 200, latestInsight);
    return;
  }

  if (request.method === "GET" && path === "/tag-plan/latest") {
    const latestTagPlan = latestTrainingTagPlan(state);
    if (latestTagPlan === undefined) {
      writeJson(response, 404, {
        error: "No training tag plan.",
        message: "POST /sensor-events or POST /bundles first, then read /tag-plan/latest.",
      });
      return;
    }

    writeJson(response, 200, latestTagPlan);
    return;
  }

  if (request.method === "GET" && path === "/instructions/latest") {
    const latestTagPlan = latestTrainingTagPlan(state);
    if (latestTagPlan === undefined) {
      writeJson(response, 404, {
        error: "No local instructions.",
        message: "POST /sensor-events or POST /bundles first, then read /instructions/latest.",
      });
      return;
    }

    writeJson(response, 200, nodeInstructionView(state.node.id, latestTagPlan));
    return;
  }

  writeJson(response, 404, {
    error: "Not found.",
    endpoints: [
      "GET /health",
      "GET /dashboard",
      "GET /topology",
      "GET /peers",
      "GET /gateway",
      "GET /mission-continuity",
      "GET /congestion",
      "GET /replication",
      "GET /replication/latest",
      "GET /ledger",
      "POST /bundles",
      "POST /sensor-events",
      "GET /insights/latest",
      "GET /tag-plan/latest",
      "GET /instructions/latest",
      "GET /bundles/pending",
    ],
  });
}

function isAuthorized(request: IncomingMessage, state: RuntimeState): boolean {
  if (state.apiToken === undefined || state.apiToken.length === 0) {
    return true;
  }
  const header = request.headers.authorization;
  return header === `Bearer ${state.apiToken}`;
}

function isJsonRequest(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
}

function parseBundle(rawBody: string): CaskBundle {
  const parsed = JSON.parse(rawBody) as Partial<CaskBundle>;
  requireString(parsed.id, "id");
  requireString(parsed.missionId, "missionId");
  requireString(parsed.sourceNodeId, "sourceNodeId");
  requireString(parsed.createdAt, "createdAt");
  requireArray(parsed.sensorEvents, "sensorEvents");
  requireArray(parsed.locationFixes, "locationFixes");
  requireArray(parsed.droneObservations, "droneObservations");
  requireArray(parsed.controlSourceEstimates, "controlSourceEstimates");
  requireArray(parsed.counterUasCues, "counterUasCues");
  requireArray(parsed.nodeHealth, "nodeHealth");
  requireString(parsed.filteringDecision, "filteringDecision");
  if (typeof parsed.priority !== "number" || !Number.isFinite(parsed.priority)) {
    throw new Error("Bundle must include numeric priority.");
  }
  return parsed as CaskBundle;
}

function buildDashboardSnapshot(state: RuntimeState): unknown {
  const gateway = selectGateway(defaultDdilMeshTopology, state.observations, {
    currentGatewayId: state.currentGatewayId,
  });
  state.currentGatewayId = gateway.selectedGatewayId ?? state.currentGatewayId;
  const gatewayObservation = state.observations.find(
    (observation) => observation.nodeId === gateway.selectedGatewayId,
  );
  const latestReport = latestReplicationReport(state);
  const latestTagPlan = latestTrainingTagPlan(state);

  return {
    nodeApi: {
      capturedAt: new Date().toISOString(),
      health: buildHealth(state),
      topology: defaultDdilMeshTopology,
      peers: {
        nodeId: state.node.id,
        peers: defaultDdilMeshTopology.nodes
          .filter((peer) => peer.id !== state.node.id)
          .map((peer) => ({
            ...peer,
            observation: state.observations.find((observation) => observation.nodeId === peer.id),
          })),
      },
      gateway,
      missionContinuity: assessMissionContinuity(
        defaultDdilMeshTopology,
        state.observations,
        gateway.selectedGatewayId ?? undefined,
      ),
      congestion: gatewayObservation === undefined
        ? null
        : decideCongestion(defaultDdilMeshTopology, gatewayObservation, 0, 0, "review_needed"),
      pending: {
        nodeId: state.node.id,
        count: state.bundles.length,
        bundles: state.bundles,
      },
      ledger: buildLocalLedgerView(state),
      replication: latestReport ?? null,
      insight: latestInsightDraft(state) ?? null,
      tagPlan: latestTagPlan ?? null,
      instructions: latestTagPlan === undefined ? null : nodeInstructionView(state.node.id, latestTagPlan),
    },
  };
}

function parseBundleResponse(rawBody: string, response: ServerResponse): CaskBundle | undefined {
  try {
    return parseBundle(rawBody);
  } catch (error: unknown) {
    writeJson(response, 400, {
      error: "Invalid bundle.",
      message: error instanceof Error ? error.message : "Bundle payload is invalid.",
    });
    return undefined;
  }
}

function parseLiveSensorInputsResponse(rawBody: string, response: ServerResponse): LiveSensorInput[] | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as LiveSensorInput[];
    }
    if (isRecord(parsed) && Array.isArray(parsed.events)) {
      return parsed.events as LiveSensorInput[];
    }
    return [parsed as LiveSensorInput];
  } catch (error: unknown) {
    writeJson(response, 400, {
      error: "Invalid sensor input.",
      message: error instanceof Error ? error.message : "Sensor input payload is invalid.",
    });
    return undefined;
  }
}

async function acceptBundleResponse(
  state: RuntimeState,
  bundle: CaskBundle,
  bundleSizeBytes: number,
  response: ServerResponse,
): Promise<void> {
  const gatewayDecision = selectGateway(defaultDdilMeshTopology, state.observations, {
    currentGatewayId: state.currentGatewayId,
  });
  const gatewayObservation = state.observations.find(
    (observation) => observation.nodeId === gatewayDecision.selectedGatewayId,
  );
  const congestion = gatewayObservation === undefined
    ? null
    : decideCongestion(
        defaultDdilMeshTopology,
        gatewayObservation,
        bundleSizeBytes,
        0,
        bundlePolicyGate(bundle),
      );

  state.bundles.push(bundle);
  const products = buildBundleRuntimeProducts(state, bundle);
  state.replicationReports.push(products.replicationReport);
  state.tagPlans.push(products.tagPlan);
  const insightResult = await draftLocalInsight(state, bundle);

  writeJson(response, 202, {
    accepted: congestion?.acceptBundle ?? true,
    storedLocal: true,
    bundleId: bundle.id,
    gatewayDecision,
    congestion,
    replication: summarizeReplicationReport(products.replicationReport),
    tagPlan: summarizeTagPlan(products.tagPlan),
    localInstructions: nodeInstructionView(state.node.id, products.tagPlan),
    localLlm: {
      mode: state.llmMode,
      model: state.llmModel,
      status: insightResult.insight === undefined ? "error" : "ready",
      error: insightResult.error,
    },
    insight: insightResult.insight,
  });
}

async function draftLocalInsight(
  state: RuntimeState,
  bundle: CaskBundle,
): Promise<{ insight?: InsightDraft; error?: string }> {
  try {
    const insight = await state.insightClient.draftInsight(bundle);
    state.insights.push(insight);
    return { insight };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown local LLM error.";
    return { error: message };
  }
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Bundle must include non-empty string ${field}.`);
  }
}

function requireArray(value: unknown, field: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Bundle must include ${field} array.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildHealth(state: RuntimeState): NodeHealth {
  const localObservation = state.observations.find((observation) => observation.nodeId === state.node.id);

  return {
    nodeId: state.node.id,
    nodeRole: nodeRole(state.node),
    observedAt: new Date().toISOString(),
    peerCount: state.observations.filter((observation) => observation.online).length - 1,
    queueDepth: state.bundles.length,
    cpuLoad: localObservation?.cpuLoad ?? 0,
    memoryUsedMb: Math.round((localObservation?.memoryPressure ?? 0) * 4096),
    networkReachable: localObservation?.internetReachable ?? false,
    foundryReachable: localObservation?.foundryReachable ?? false,
    modelStatus: "ready",
  };
}

function nodeRole(node: NodeDescriptor): NodeHealth["nodeRole"] {
  if (node.platform === "raspberry_pi_5") {
    return "pi5_hub";
  }
  if (node.platform === "jetson_orin_nano") {
    return "jetson_orin_inference";
  }
  return "pi4_edge";
}

function bundlePolicyGate(bundle: CaskBundle): PolicyState {
  const cuePolicy = bundle.counterUasCues?.[0]?.policyGate;
  if (cuePolicy !== undefined) {
    return cuePolicy;
  }
  const eventPolicy = bundle.sensorEvents?.[0]?.policyState;
  return eventPolicy ?? "review_needed";
}

function buildBundleRuntimeProducts(
  state: RuntimeState,
  bundle: CaskBundle,
): { tagPlan: TrainingTagPlan; replicationReport: ReplicationReport } {
  const offlineNodeIds = state.observations
    .filter((observation) => !observation.online)
    .map((observation) => observation.nodeId);
  const resolution = buildDistributedResolutionReport(bundle, { offlineNodeIds });
  const tagPlan = buildTrainingTagPlan(bundle, resolution, {
    operatorAuthorized: parseBooleanEnv(process.env.ALTIAIR_OPERATOR_AUTHORIZED),
  });
  return {
    tagPlan,
    replicationReport: buildReplicationReport(
      defaultDdilMeshTopology,
      bundle,
      resolution,
      tagPlan,
      state.observations,
      { offlineNodeIds },
    ),
  };
}

function latestReplicationReport(state: RuntimeState): ReplicationReport | undefined {
  return state.replicationReports[state.replicationReports.length - 1];
}

function latestInsightDraft(state: RuntimeState): InsightDraft | undefined {
  return state.insights[state.insights.length - 1];
}

function latestTrainingTagPlan(state: RuntimeState): TrainingTagPlan | undefined {
  return state.tagPlans[state.tagPlans.length - 1];
}

function summarizeTagPlan(tagPlan: TrainingTagPlan): unknown {
  return {
    objectiveId: tagPlan.objectiveId,
    subjectRef: tagPlan.subjectRef,
    authorizedZoneId: tagPlan.authorizedZoneId,
    policyGate: tagPlan.policyGate,
    operatorAuthorized: tagPlan.operatorAuthorized,
    nonContactOnly: tagPlan.nonContactOnly,
    resolvedByPeerMesh: tagPlan.resolvedByPeerMesh,
    selectedNodeId: tagPlan.selectedNodeId,
    degraded: tagPlan.degraded,
    executionState: tagPlan.executionState,
  };
}

function nodeInstructionView(nodeId: string, tagPlan: TrainingTagPlan): unknown {
  const localAssignments = tagPlan.assignments.filter((assignment) => assignment.nodeId === nodeId);
  return {
    nodeId,
    objectiveId: tagPlan.objectiveId,
    subjectRef: tagPlan.subjectRef,
    authorizedZoneId: tagPlan.authorizedZoneId,
    executionState: tagPlan.executionState,
    policyGate: tagPlan.policyGate,
    operatorAuthorized: tagPlan.operatorAuthorized,
    selectedNodeId: tagPlan.selectedNodeId,
    degraded: tagPlan.degraded,
    nonContactOnly: tagPlan.nonContactOnly,
    localAssignments,
    standby:
      localAssignments.length === 0
        ? "No primary local assignment; remain available as a fallback relay and preserve replicated mission records."
        : undefined,
    prohibitedActions: tagPlan.prohibitedActions,
  };
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function summarizeReplicationReport(report: ReplicationReport | undefined): unknown {
  if (report === undefined) {
    return null;
  }
  return {
    bundleId: report.bundleId,
    recordCount: report.records.length,
    requiredReplicaNodeIds: report.requiredReplicaNodeIds,
    allReachableNodesHaveAllRecords: report.allReachableNodesHaveAllRecords,
    survivableNodeLoss: report.survivableNodeLoss,
  };
}

function buildLocalLedgerView(state: RuntimeState): unknown {
  if (state.replicationReports.length === 0) {
    return {
      nodeId: state.node.id,
      bundleCount: state.bundles.length,
      storedRecordCount: 0,
      storedRecordIds: [],
      records: [],
      inventories: [],
      reports: [],
    };
  }

  const recordsByKey = new Map(
    state.replicationReports
      .flatMap((report) => report.records)
      .map((record) => [`${record.recordId}:${record.contentHash}`, record]),
  );
  const inventories = defaultDdilMeshTopology.nodes.map((node) => {
    const storedRecordIds = new Set<string>();
    let online = false;
    for (const report of state.replicationReports) {
      const inventory = report.inventories.find((candidate) => candidate.nodeId === node.id);
      if (inventory === undefined) {
        continue;
      }
      online = online || inventory.online;
      for (const recordId of inventory.storedRecordIds) {
        storedRecordIds.add(recordId);
      }
    }
    return {
      nodeId: node.id,
      online,
      storedRecordIds: [...storedRecordIds].sort(),
    };
  });
  const localInventory = inventories.find((inventory) => inventory.nodeId === state.node.id);
  const storedRecordIds = localInventory?.storedRecordIds ?? [];
  const storedRecordIdSet = new Set(storedRecordIds);
  const latestReport = latestReplicationReport(state);

  return {
    nodeId: state.node.id,
    latestBundleId: latestReport?.bundleId,
    bundleCount: state.bundles.length,
    online: localInventory?.online ?? false,
    storedRecordCount: storedRecordIds.length,
    storedRecordIds,
    records: [...recordsByKey.values()].filter((record) => storedRecordIdSet.has(record.recordId)),
    inventories,
    reports: state.replicationReports.map(summarizeReplicationReport),
    allReachableNodesHaveAllRecords: state.replicationReports.every(
      (report) => report.allReachableNodesHaveAllRecords,
    ),
    survivableNodeLoss: state.replicationReports.every((report) => report.survivableNodeLoss),
  };
}

function policyQuery(url: URL): PolicyState {
  const value = url.searchParams.get("policy");
  if (
    value === "collect_only" ||
    value === "review_needed" ||
    value === "authorized_to_share" ||
    value === "blocked"
  ) {
    return value;
  }
  return "review_needed";
}

function numberQuery(url: URL, name: string, fallback: number): number {
  const value = url.searchParams.get(name);
  if (value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    request.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    ...responseHeaders("application/json; charset=utf-8"),
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writeCorsPreflight(response: ServerResponse): void {
  response.writeHead(204, responseHeaders("text/plain; charset=utf-8"));
  response.end();
}

function responseHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...(corsOrigin === undefined
      ? {}
      : {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "authorization,content-type",
          "access-control-max-age": "600",
          "vary": "Origin",
        }),
  };
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

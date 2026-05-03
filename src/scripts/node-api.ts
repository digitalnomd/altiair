import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import {
  assessMissionContinuity,
  decideCongestion,
  selectGateway,
} from "../mesh/gatewaySelection.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";
import { buildReplicationReport } from "../mesh/replication.js";
import type { CaskBundle, NodeHealth, PolicyState } from "../cask/types.js";
import type { NodeDescriptor, PeerObservation, ReplicationReport } from "../mesh/types.js";

interface RuntimeState {
  node: NodeDescriptor;
  observations: PeerObservation[];
  bundles: CaskBundle[];
  replicationReports: ReplicationReport[];
  startedAt: number;
  currentGatewayId?: string;
  apiToken?: string;
}

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

const state: RuntimeState = {
  node,
  observations: nominalMeshObservations,
  bundles: [],
  replicationReports: [],
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
          Buffer.byteLength(rawBody),
          0,
          bundlePolicyGate(bundle),
        );

    state.bundles.push(bundle);
    const replicationReport = buildBundleReplicationReport(state, bundle);
    state.replicationReports.push(replicationReport);

    writeJson(response, 202, {
      accepted: congestion?.acceptBundle ?? true,
      storedLocal: true,
      bundleId: bundle.id,
      gatewayDecision,
      congestion,
      replication: summarizeReplicationReport(replicationReport),
    });
    return;
  }

  writeJson(response, 404, {
    error: "Not found.",
    endpoints: [
      "GET /health",
      "GET /topology",
      "GET /peers",
      "GET /gateway",
      "GET /mission-continuity",
      "GET /congestion",
      "GET /replication",
      "GET /replication/latest",
      "GET /ledger",
      "POST /bundles",
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
    modelStatus: state.node.roles.includes("accelerated_inference") || state.node.roles.includes("mesh_hub")
      ? "ready"
      : "disabled",
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

function buildBundleReplicationReport(state: RuntimeState, bundle: CaskBundle): ReplicationReport {
  const offlineNodeIds = state.observations
    .filter((observation) => !observation.online)
    .map((observation) => observation.nodeId);
  const resolution = buildDistributedResolutionReport(bundle, { offlineNodeIds });
  const tagPlan = buildTrainingTagPlan(bundle, resolution);
  return buildReplicationReport(
    defaultDdilMeshTopology,
    bundle,
    resolution,
    tagPlan,
    state.observations,
    { offlineNodeIds },
  );
}

function latestReplicationReport(state: RuntimeState): ReplicationReport | undefined {
  return state.replicationReports[state.replicationReports.length - 1];
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
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

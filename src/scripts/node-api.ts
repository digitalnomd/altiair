import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../config.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import {
  assessMissionContinuity,
  decideCongestion,
  selectGateway,
} from "../mesh/gatewaySelection.js";
import {
  buildCoordinatorDirective,
  buildGossipWorldState,
  type CoordinatorDirective,
} from "../mesh/coordinator.js";
import {
  buildDeploymentOrder,
  buildMissionInstruction,
  type CaskDeploymentOrder,
  type CaskMissionInstruction,
  type MissionInstructionInput,
} from "../cask/missionDeployment.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";
import { buildReplicationReport } from "../mesh/replication.js";
import { buildCaskBundleFromLiveInputs, type LiveSensorInput } from "../sensors/liveMerge.js";
import { buildCaskLlmContextPack } from "../llm/caskContext.js";
import { createLocalInsightClient, type LocalInsightClient } from "../llm/localInsight.js";
import {
  createFoundryIntelligenceClient,
  type FoundryIntelligenceClient,
  type FoundryIntelligenceSnapshot,
} from "../foundry/intelligence.js";
import { createFoundryUploader, type FoundryUploader } from "../foundry/uploader.js";
import type { CaskBundle, InsightDraft, NodeHealth, PolicyState, UploadAck } from "../cask/types.js";
import type { TrainingTagPlan } from "../cask/trainingTag.js";
import type { NodeDescriptor, PeerObservation, ReplicationReport } from "../mesh/types.js";
import {
  buildBundleStreamRecords,
  buildFoundrySyncStreamRecord,
  buildStreamStatus,
  caskStreamTopicDefinitions,
  filterStreamRecords,
  toKafkaMessage,
  type CaskStreamRecord,
} from "../stream/alwaysOn.js";

interface RuntimeState {
  node: NodeDescriptor;
  observations: PeerObservation[];
  bundles: CaskBundle[];
  insights: InsightDraft[];
  tagPlans: TrainingTagPlan[];
  replicationReports: ReplicationReport[];
  coordinatorDirectives: CoordinatorDirective[];
  missionInstructions: CaskMissionInstruction[];
  deploymentOrders: CaskDeploymentOrder[];
  insightClient: LocalInsightClient;
  foundryIntelligenceClient: FoundryIntelligenceClient;
  foundryIntelligenceSnapshots: FoundryIntelligenceSnapshot[];
  foundryUploader: FoundryUploader;
  uploadAcks: UploadAck[];
  streamRecords: CaskStreamRecord[];
  streamSequence: number;
  llmMode: string;
  llmModel: string;
  startedAt: number;
  currentGatewayId?: string;
  currentCoordinatorLeaderId?: string;
  coordinatorTerm: number;
  coordinatorIndex: number;
  apiToken?: string;
}

interface LiveSensorPost {
  inputs: LiveSensorInput[];
  missionId?: string;
  sourceNodeId?: string;
  bundleId?: string;
  createdAt?: Date;
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
const streamRetentionLimit = positiveIntegerEnv("ALTIAIR_STREAM_RETENTION", 2_000);

const state: RuntimeState = {
  node,
  observations: nominalMeshObservations,
  bundles: [],
  insights: [],
  tagPlans: [],
  replicationReports: [],
  coordinatorDirectives: [],
  missionInstructions: [],
  deploymentOrders: [],
  insightClient: createLocalInsightClient(config.llm),
  foundryIntelligenceClient: createFoundryIntelligenceClient(config.foundry),
  foundryIntelligenceSnapshots: [],
  foundryUploader: createFoundryUploader(config.foundry),
  uploadAcks: [],
  streamRecords: [],
  streamSequence: 1,
  llmMode: config.llm.mode,
  llmModel: config.llm.model,
  startedAt: Date.now(),
  currentGatewayId: process.env.ALTIAIR_CURRENT_GATEWAY_ID,
  currentCoordinatorLeaderId: process.env.ALTIAIR_CURRENT_COORDINATOR_ID,
  coordinatorTerm: Number(process.env.ALTIAIR_COORDINATOR_TERM ?? 0),
  coordinatorIndex: 0,
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
        missionDeploy: "/mission/deploy",
        coordinator: "/coordinator/latest",
        stream: "/stream/status",
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

  if (request.method === "GET" && path === "/gossip/world") {
    writeJson(
      response,
      200,
      buildGossipWorldState(
        defaultDdilMeshTopology,
        state.observations,
        latestTrainingTagPlan(state),
      ),
    );
    return;
  }

  if (request.method === "GET" && path === "/mission/instructions/latest") {
    const latestInstruction = latestMissionInstruction(state);
    if (latestInstruction === undefined) {
      writeJson(response, 404, {
        error: "No mission instruction.",
        message: "POST /mission/instructions or POST /mission/deploy first.",
      });
      return;
    }

    writeJson(response, 200, latestInstruction);
    return;
  }

  if (request.method === "GET" && path === "/mission/deployment/latest") {
    const latestDeployment = latestDeploymentOrder(state);
    if (latestDeployment === undefined) {
      writeJson(response, 404, {
        error: "No mission deployment.",
        message: "POST /mission/deploy first.",
      });
      return;
    }

    writeJson(response, 200, latestDeployment);
    return;
  }

  if (request.method === "GET" && path === "/mission/timeline") {
    writeJson(response, 200, {
      nodeId: state.node.id,
      deploymentId: latestDeploymentOrder(state)?.deploymentId ?? null,
      timeline: state.deploymentOrders.flatMap((deployment) => deployment.timeline),
    });
    return;
  }

  if (request.method === "GET" && path === "/foundry/intelligence") {
    const pageSize = numberQuery(url, "page_size", 25);
    const missionId = url.searchParams.get("mission_id") ?? undefined;
    const refresh = boolQuery(url, "refresh", false);
    if (!refresh) {
      const latestSnapshot = latestFoundryIntelligenceSnapshot(state);
      if (latestSnapshot !== undefined) {
        writeJson(response, 200, latestSnapshot);
        return;
      }
    }

    const snapshot = await state.foundryIntelligenceClient.getMissionIntelligence({
      missionId,
      pageSize,
      objectExports: listQuery(url, "object"),
    });
    state.foundryIntelligenceSnapshots.push(snapshot);
    writeJson(response, 200, snapshot);
    return;
  }

  if (request.method === "GET" && path === "/foundry/sync/latest") {
    const latestAck = latestUploadAck(state);
    if (latestAck === undefined) {
      writeJson(response, 404, {
        error: "No Foundry sync acknowledgement.",
        message: "POST /foundry/upload after a bundle exists to sync what happened back to the commander.",
      });
      return;
    }

    writeJson(response, 200, buildCommanderSyncPackage(state, latestAck));
    return;
  }

  if (request.method === "GET" && path === "/coordinator/latest") {
    const latestCoordinator = latestCoordinatorDirective(state);
    if (latestCoordinator === undefined) {
      writeJson(response, 404, {
        error: "No coordinator directive.",
        message: "POST /sensor-events or POST /bundles first, then read /coordinator/latest.",
      });
      return;
    }

    writeJson(response, 200, latestCoordinator);
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

  if (request.method === "GET" && path === "/stream/topics") {
    writeJson(response, 200, {
      schemaVersion: "altiair-cask-stream-v1",
      topics: caskStreamTopicDefinitions,
      brokerRequiredForDemo: false,
      kafkaCompatibleEnvelope: true,
    });
    return;
  }

  if (request.method === "GET" && path === "/stream/status") {
    writeJson(response, 200, buildNodeStreamStatus(state));
    return;
  }

  if (request.method === "GET" && path === "/stream/records") {
    const records = filterStreamRecords(state.streamRecords, {
      topic: url.searchParams.get("topic") ?? undefined,
      afterSequence: numberQuery(url, "after_sequence", -1),
      limit: numberQuery(url, "limit", 100),
    });
    const format = url.searchParams.get("format");
    writeJson(response, 200, {
      nodeId: state.node.id,
      stream: buildNodeStreamStatus(state),
      records,
      kafkaMessages: format === "kafka" ? records.map(toKafkaMessage) : undefined,
    });
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
    const livePost = parseLiveSensorPostResponse(rawBody, response);
    if (livePost === undefined) {
      return;
    }

    const bundle = buildCaskBundleFromLiveInputs(livePost.inputs, {
      missionId: livePost.missionId ?? process.env.ALTIAIR_MISSION_ID,
      sourceNodeId: livePost.sourceNodeId ?? state.node.id,
      bundleId: livePost.bundleId,
      createdAt: livePost.createdAt,
    });
    applyLiveNodeHealthInputs(state, livePost.inputs);
    await acceptBundleResponse(state, bundle, Buffer.byteLength(rawBody), response);
    return;
  }

  if (request.method === "POST" && path === "/mission/instructions") {
    if (!isJsonRequest(request)) {
      writeJson(response, 415, {
        error: "Unsupported media type.",
        message: "POST /mission/instructions requires content-type application/json.",
      });
      return;
    }

    const rawBody = await readBody(request, defaultDdilMeshTopology.policy.maxBundleSizeBytes);
    const input = parseMissionInstructionInputResponse(rawBody, response);
    if (input === undefined) {
      return;
    }

    const instruction = buildMissionInstruction(input);
    if (!state.missionInstructions.some((candidate) => candidate.instructionId === instruction.instructionId)) {
      state.missionInstructions.push(instruction);
    }
    writeJson(response, instruction.policyState === "blocked" ? 422 : 202, {
      accepted: instruction.policyState !== "blocked",
      instruction,
    });
    return;
  }

  if (request.method === "POST" && path === "/mission/deploy") {
    if (!isJsonRequest(request)) {
      writeJson(response, 415, {
        error: "Unsupported media type.",
        message: "POST /mission/deploy requires content-type application/json.",
      });
      return;
    }

    const rawBody = await readBody(request, defaultDdilMeshTopology.policy.maxBundleSizeBytes);
    const deployment = parseAndBuildDeploymentResponse(rawBody, state, response);
    if (deployment === undefined) {
      return;
    }

    state.deploymentOrders.push(deployment);
    writeJson(response, deployment.state === "blocked" ? 422 : 202, {
      accepted: deployment.state !== "blocked",
      deployment,
    });
    return;
  }

  if (request.method === "POST" && path === "/foundry/upload") {
    const bundle = latestBundle(state);
    if (bundle === undefined) {
      writeJson(response, 404, {
        error: "No CASK bundle available.",
        message: "POST /sensor-events or POST /bundles first, then POST /foundry/upload.",
      });
      return;
    }

    const insightResult = await ensureInsightForBundle(state, bundle);
    if (insightResult.insight === undefined) {
      writeJson(response, 503, {
        error: "No local insight available.",
        message: insightResult.error ?? "Local insight generation failed.",
      });
      return;
    }

    const ack = await state.foundryUploader.uploadBundle(bundle, insightResult.insight);
    state.uploadAcks.push(ack);
    appendFoundrySyncStreamRecord(state, bundle, ack);
    writeJson(response, ack.status === "failed" ? 502 : 202, buildCommanderSyncPackage(state, ack));
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
      "GET /gossip/world",
      "GET /mission/instructions/latest",
      "GET /mission/deployment/latest",
      "GET /mission/timeline",
      "GET /foundry/intelligence",
      "GET /foundry/sync/latest",
      "GET /coordinator/latest",
      "GET /congestion",
      "GET /replication",
      "GET /replication/latest",
      "GET /ledger",
      "POST /bundles",
      "POST /sensor-events",
      "POST /mission/instructions",
      "POST /mission/deploy",
      "POST /foundry/upload",
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
  const latestCoordinator = latestCoordinatorDirective(state);
  const latestInstruction = latestMissionInstruction(state);
  const latestDeployment = latestDeploymentOrder(state);
  const latestFoundryIntelligence = latestFoundryIntelligenceSnapshot(state);

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
      missionInstruction: latestInstruction ?? null,
      deploymentOrder: latestDeployment ?? null,
      foundryIntelligence: latestFoundryIntelligence ?? null,
      foundrySync: latestUploadAck(state) ?? null,
      coordinator: latestCoordinator ?? null,
      stream: buildNodeStreamStatus(state),
      gossipWorld: buildGossipWorldState(
        defaultDdilMeshTopology,
        state.observations,
        latestTagPlan,
      ),
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

function parseLiveSensorPostResponse(rawBody: string, response: ServerResponse): LiveSensorPost | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (Array.isArray(parsed)) {
      return { inputs: parsed as LiveSensorInput[] };
    }
    if (isRecord(parsed) && Array.isArray(parsed.events)) {
      return {
        inputs: parsed.events as LiveSensorInput[],
        missionId: stringField(parsed, "missionId"),
        sourceNodeId: stringField(parsed, "sourceNodeId"),
        bundleId: stringField(parsed, "bundleId"),
        createdAt: dateField(parsed, "createdAt"),
      };
    }
    return { inputs: [parsed as LiveSensorInput] };
  } catch (error: unknown) {
    writeJson(response, 400, {
      error: "Invalid sensor input.",
      message: error instanceof Error ? error.message : "Sensor input payload is invalid.",
    });
    return undefined;
  }
}

function parseMissionInstructionInputResponse(
  rawBody: string,
  response: ServerResponse,
): MissionInstructionInput | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Mission instruction payload must be an object.");
    }
    const missionText = stringField(parsed, "missionText") ?? stringField(parsed, "instruction");
    if (missionText === undefined) {
      throw new Error("Mission instruction payload must include missionText.");
    }
    return {
      missionId: stringField(parsed, "missionId"),
      title: stringField(parsed, "title"),
      missionText,
      objectiveType: objectiveTypeField(parsed),
      authorizedZoneId: stringField(parsed, "authorizedZoneId"),
      subjectRef: stringField(parsed, "subjectRef"),
      requiredSensorKinds: sensorKindsField(parsed),
      operatorAuthorized: booleanField(parsed, "operatorAuthorized"),
      requestedBy: stringField(parsed, "requestedBy"),
      createdAt: stringField(parsed, "createdAt"),
    };
  } catch (error: unknown) {
    writeJson(response, 400, {
      error: "Invalid mission instruction.",
      message: error instanceof Error ? error.message : "Mission instruction payload is invalid.",
    });
    return undefined;
  }
}

function parseAndBuildDeploymentResponse(
  rawBody: string,
  state: RuntimeState,
  response: ServerResponse,
): CaskDeploymentOrder | undefined {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Mission deployment payload must be an object.");
    }

    const instruction = stringField(parsed, "instructionId") !== undefined &&
      stringField(parsed, "missionText") === undefined &&
      stringField(parsed, "instruction") === undefined
      ? existingInstruction(state, stringField(parsed, "instructionId")!)
      : buildMissionInstructionFromRecord(parsed, state);

    if (!state.missionInstructions.some((candidate) => candidate.instructionId === instruction.instructionId)) {
      state.missionInstructions.push(instruction);
    }
    return buildDeploymentOrder(
      instruction,
      defaultDdilMeshTopology,
      state.observations,
      { deploy: booleanField(parsed, "deploy") ?? true },
    );
  } catch (error: unknown) {
    writeJson(response, 400, {
      error: "Invalid mission deployment.",
      message: error instanceof Error ? error.message : "Mission deployment payload is invalid.",
    });
    return undefined;
  }
}

function buildMissionInstructionFromRecord(
  parsed: Record<string, unknown>,
  state: RuntimeState,
): CaskMissionInstruction {
  const payload = parseMissionInstructionInputPayload(parsed, state);
  return buildMissionInstruction(payload);
}

function parseMissionInstructionInputPayload(
  parsed: Record<string, unknown>,
  state: RuntimeState,
): MissionInstructionInput {
  const missionText = stringField(parsed, "missionText") ?? stringField(parsed, "instruction");
  if (missionText === undefined) {
    const latestInstruction = latestMissionInstruction(state);
    if (latestInstruction !== undefined) {
      return {
        missionId: latestInstruction.missionId,
        title: latestInstruction.title,
        missionText: latestInstruction.missionText,
        objectiveType: latestInstruction.objectiveType,
        authorizedZoneId: latestInstruction.authorizedZoneId,
        subjectRef: latestInstruction.subjectRef,
        requiredSensorKinds: latestInstruction.requiredSensorKinds,
        operatorAuthorized: latestInstruction.operatorAuthorized,
        requestedBy: latestInstruction.requestedBy,
      };
    }
    throw new Error("Mission deployment payload must include missionText or reference an existing instructionId.");
  }

  return {
    missionId: stringField(parsed, "missionId"),
    title: stringField(parsed, "title"),
    missionText,
    objectiveType: objectiveTypeField(parsed),
    authorizedZoneId: stringField(parsed, "authorizedZoneId"),
    subjectRef: stringField(parsed, "subjectRef"),
    requiredSensorKinds: sensorKindsField(parsed),
    operatorAuthorized: booleanField(parsed, "operatorAuthorized"),
    requestedBy: stringField(parsed, "requestedBy"),
    createdAt: stringField(parsed, "createdAt"),
  };
}

function existingInstruction(state: RuntimeState, instructionId: string): CaskMissionInstruction {
  const instruction = state.missionInstructions.find((candidate) => candidate.instructionId === instructionId);
  if (instruction === undefined) {
    throw new Error(`No mission instruction found for instructionId ${instructionId}.`);
  }
  return instruction;
}

function objectiveTypeField(record: Record<string, unknown>): MissionInstructionInput["objectiveType"] {
  const value = record.objectiveType;
  if (
    value === "controlled_training_tag" ||
    value === "counter_uas_review" ||
    value === "mesh_resilience_drill"
  ) {
    return value;
  }
  return undefined;
}

function sensorKindsField(record: Record<string, unknown>): MissionInstructionInput["requiredSensorKinds"] {
  const value = record.requiredSensorKinds;
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((candidate) =>
    candidate === "rfid" ||
    candidate === "audio" ||
    candidate === "camera" ||
    candidate === "node_health",
  );
}

function booleanField(record: Record<string, unknown>, field: string): boolean | undefined {
  const value = record[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (["1", "true", "yes"].includes(value.toLowerCase())) {
      return true;
    }
    if (["0", "false", "no"].includes(value.toLowerCase())) {
      return false;
    }
  }
  return undefined;
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dateField(record: Record<string, unknown>, field: string): Date | undefined {
  const value = stringField(record, field);
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${field} must be an ISO timestamp.`);
  }
  return date;
}

function applyLiveNodeHealthInputs(state: RuntimeState, inputs: LiveSensorInput[]): void {
  for (const input of inputs) {
    if (input.kind !== "node_health") {
      continue;
    }

    const existing = state.observations.find((observation) => observation.nodeId === input.nodeId);
    const online = input.networkReachable ?? existing?.online ?? true;
    const nextObservation: PeerObservation = {
      nodeId: input.nodeId,
      online,
      lastSeenSeconds: online ? 0 : defaultDdilMeshTopology.policy.maxClockSkewSeconds + 1,
      linkClass: existing?.linkClass ?? "wifi_ap",
      latencyMs: online ? existing?.latencyMs ?? 18 : 999,
      packetLoss: online ? existing?.packetLoss ?? 0.02 : 1,
      queueDepth: input.queueDepth ?? existing?.queueDepth ?? 0,
      inFlightTransfers: existing?.inFlightTransfers ?? 0,
      cpuLoad: input.cpuLoad ?? existing?.cpuLoad ?? 0,
      memoryPressure: memoryPressureFrom(input.memoryUsedMb, existing?.memoryPressure),
      internetReachable: existing?.internetReachable ?? false,
      foundryReachable: input.foundryReachable ?? existing?.foundryReachable ?? false,
      recentUploadSuccess: existing?.recentUploadSuccess ?? false,
      uplinkKbps: online ? existing?.uplinkKbps ?? 0 : 0,
      downlinkKbps: online ? existing?.downlinkKbps ?? 0 : 0,
    };

    const index = state.observations.findIndex((observation) => observation.nodeId === input.nodeId);
    if (index >= 0) {
      state.observations[index] = nextObservation;
    } else {
      state.observations.push(nextObservation);
    }
  }
}

function memoryPressureFrom(memoryUsedMb: number | undefined, fallback: number | undefined): number {
  if (memoryUsedMb === undefined || !Number.isFinite(memoryUsedMb)) {
    return fallback ?? 0;
  }
  return Math.max(0, Math.min(1, memoryUsedMb / 4096));
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
  const caskContext = buildCaskLlmContextPack(bundle, latestFoundryIntelligenceSnapshot(state));
  const insightResult = await draftLocalInsight(state, bundle, caskContext);
  const coordinator = buildCoordinatorDirective(
    defaultDdilMeshTopology,
    state.observations,
    bundle.id,
    bundle.missionId,
    products.tagPlan,
    insightResult.insight,
    {
      localNodeId: state.node.id,
      previousLeaderId: state.currentCoordinatorLeaderId,
      previousTerm: state.coordinatorTerm,
      previousIndex: state.coordinatorIndex,
      model: state.llmModel,
      mode: state.llmMode,
    },
  );
  state.coordinatorDirectives.push(coordinator);
  state.currentCoordinatorLeaderId = coordinator.election.leaderId ?? state.currentCoordinatorLeaderId;
  state.coordinatorTerm = coordinator.election.term;
  state.coordinatorIndex += 1;
  const streamAppend = appendBundleStreamRecords(
    state,
    bundle,
    caskContext,
    insightResult.insight,
    coordinator,
  );

  writeJson(response, 202, {
    accepted: congestion?.acceptBundle ?? true,
    storedLocal: true,
    bundleId: bundle.id,
    gatewayDecision,
    congestion,
    replication: summarizeReplicationReport(products.replicationReport),
    tagPlan: summarizeTagPlan(products.tagPlan),
    coordinator: summarizeCoordinatorDirective(coordinator),
    stream: {
      appendedRecords: streamAppend.records.length,
      latestSequence: streamAppend.nextSequence - 1,
      status: buildNodeStreamStatus(state),
    },
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
  caskContext = buildCaskLlmContextPack(bundle, latestFoundryIntelligenceSnapshot(state)),
): Promise<{ insight?: InsightDraft; error?: string }> {
  try {
    const insight = await state.insightClient.draftInsight(bundle, caskContext);
    state.insights.push(insight);
    return { insight };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown local LLM error.";
    return { error: message };
  }
}

async function ensureInsightForBundle(
  state: RuntimeState,
  bundle: CaskBundle,
): Promise<{ insight?: InsightDraft; error?: string }> {
  const existing = state.insights.find((insight) => insight.bundleId === bundle.id);
  if (existing !== undefined) {
    return { insight: existing };
  }
  return draftLocalInsight(state, bundle);
}

function appendBundleStreamRecords(
  state: RuntimeState,
  bundle: CaskBundle,
  caskContext: ReturnType<typeof buildCaskLlmContextPack>,
  insight: InsightDraft | undefined,
  coordinator: CoordinatorDirective,
): { records: CaskStreamRecord[]; nextSequence: number } {
  const append = buildBundleStreamRecords({
    bundle,
    context: caskContext,
    producerNodeId: state.node.id,
    sequenceStart: state.streamSequence,
    insight,
    coordinator,
  });
  appendStreamRecords(state, append.records);
  state.streamSequence = append.nextSequence;
  return append;
}

function appendFoundrySyncStreamRecord(
  state: RuntimeState,
  bundle: CaskBundle,
  ack: UploadAck,
): CaskStreamRecord {
  const record = buildFoundrySyncStreamRecord({
    ack,
    missionId: bundle.missionId,
    producerNodeId: state.node.id,
    sourceNodeId: state.currentGatewayId ?? state.node.id,
    sequence: state.streamSequence,
  });
  appendStreamRecords(state, [record]);
  state.streamSequence += 1;
  return record;
}

function appendStreamRecords(state: RuntimeState, records: CaskStreamRecord[]): void {
  state.streamRecords.push(...records);
  if (state.streamRecords.length > streamRetentionLimit) {
    state.streamRecords.splice(0, state.streamRecords.length - streamRetentionLimit);
  }
}

function buildNodeStreamStatus(state: RuntimeState): ReturnType<typeof buildStreamStatus> & {
  retention: { maxRecords: number; retainedFromSequence: number | null };
  kafkaForwarderReady: boolean;
  brokerRequiredForDemo: boolean;
} {
  return {
    ...buildStreamStatus(state.streamRecords),
    retention: {
      maxRecords: streamRetentionLimit,
      retainedFromSequence: state.streamRecords[0]?.sequence ?? null,
    },
    kafkaForwarderReady: true,
    brokerRequiredForDemo: false,
  };
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

function latestCoordinatorDirective(state: RuntimeState): CoordinatorDirective | undefined {
  return state.coordinatorDirectives[state.coordinatorDirectives.length - 1];
}

function latestBundle(state: RuntimeState): CaskBundle | undefined {
  return state.bundles[state.bundles.length - 1];
}

function latestMissionInstruction(state: RuntimeState): CaskMissionInstruction | undefined {
  return state.missionInstructions[state.missionInstructions.length - 1];
}

function latestDeploymentOrder(state: RuntimeState): CaskDeploymentOrder | undefined {
  return state.deploymentOrders[state.deploymentOrders.length - 1];
}

function latestFoundryIntelligenceSnapshot(state: RuntimeState): FoundryIntelligenceSnapshot | undefined {
  return state.foundryIntelligenceSnapshots[state.foundryIntelligenceSnapshots.length - 1];
}

function latestUploadAck(state: RuntimeState): UploadAck | undefined {
  return state.uploadAcks[state.uploadAcks.length - 1];
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

function summarizeCoordinatorDirective(directive: CoordinatorDirective): unknown {
  return {
    id: directive.id,
    leaderId: directive.election.leaderId,
    term: directive.election.term,
    authorityState: directive.election.authorityState,
    recommendedNextAction: directive.recommendedNextAction,
    instructionNodeIds: Object.keys(directive.instructions).sort(),
  };
}

function buildCommanderSyncPackage(state: RuntimeState, ack: UploadAck): unknown {
  const latestDeployment = latestDeploymentOrder(state);
  const latestCoordinator = latestCoordinatorDirective(state);
  const latestInsight = latestInsightDraft(state);
  const latestReport = latestReplicationReport(state);
  return {
    ack,
    commanderVisibility: {
      status: ack.status,
      mode: ack.mode,
      uploadedAt: ack.uploadedAt,
      message: ack.message ??
        (ack.status === "accepted"
          ? "Foundry accepted the available CASK records for commander visibility."
          : "CASK records are queued locally for commander visibility when connectivity and ontology actions allow it."),
    },
    mission: {
      instruction: latestMissionInstruction(state) ?? null,
      deployment: latestDeployment === undefined
        ? null
        : {
            deploymentId: latestDeployment.deploymentId,
            state: latestDeployment.state,
            title: latestDeployment.title,
            authorizedZoneId: latestDeployment.authorizedZoneId,
            subjectRef: latestDeployment.subjectRef,
            nodeLeaseCount: latestDeployment.nodeLeases.length,
            timelineEventCount: latestDeployment.timeline.length,
          },
    },
    evidence: {
      latestBundleId: latestBundle(state)?.id ?? null,
      latestInsight: latestInsight === undefined
        ? null
        : {
            id: latestInsight.id,
            summary: latestInsight.summary,
            confidence: latestInsight.confidence,
            evidenceIds: latestInsight.evidenceIds,
            policyState: latestInsight.policyState,
          },
      replication: summarizeReplicationReport(latestReport),
      coordinator: latestCoordinator === undefined ? null : summarizeCoordinatorDirective(latestCoordinator),
    },
    constraints: [
      "Foundry sync is gateway-selected and only runs when connectivity, credentials, ontology scope, and policy allow it.",
      "The local LLM, gossip, and replicated CASK ledger continue decentralized operation without Foundry.",
      "Commander sync is evidence, context, and after-action visibility; it is not an autonomous action channel.",
    ],
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

function boolQuery(url: URL, name: string, fallback: boolean): boolean {
  const value = url.searchParams.get(name);
  if (value === null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function listQuery(url: URL, name: string): string[] | undefined {
  const values = url.searchParams.getAll(name).flatMap((value) => value.split(","));
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return cleaned.length === 0 ? undefined : cleaned;
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
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), usb=(), serial=()",
    "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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

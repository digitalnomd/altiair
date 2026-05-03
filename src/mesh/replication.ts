import { createHash } from "node:crypto";
import type { CaskBundle, PolicyState } from "../cask/types.js";
import type { DistributedResolutionReport } from "../cask/distributedResolution.js";
import type { TrainingTagPlan } from "../cask/trainingTag.js";
import type {
  MeshTopology,
  NodeReplicationInventory,
  PeerObservation,
  ReplicatedRecord,
  ReplicationRecordKind,
  ReplicationReport,
} from "./types.js";

interface ReplicationPayload {
  recordId: string;
  kind: ReplicationRecordKind;
  sourceNodeId: string;
  policyState: PolicyState;
  payload: unknown;
}

export interface ReplicationOptions {
  offlineNodeIds?: string[];
}

export function buildReplicationReport(
  topology: MeshTopology,
  bundle: CaskBundle,
  resolution: DistributedResolutionReport,
  tagPlan: TrainingTagPlan,
  observations: PeerObservation[],
  options: ReplicationOptions = {},
): ReplicationReport {
  const offlineNodeIds = new Set(options.offlineNodeIds ?? []);
  const onlineNodeIds = topology.nodes
    .filter((node) => !offlineNodeIds.has(node.id))
    .filter((node) => observations.find((observation) => observation.nodeId === node.id)?.online ?? true)
    .map((node) => node.id);

  const records = collectReplicationPayloads(bundle, resolution, tagPlan)
    .map((payload) => buildRecord(payload, onlineNodeIds));
  const inventories = buildInventories(topology, records, onlineNodeIds);
  const allReachableNodesHaveAllRecords = records.every((record) => record.missingReplicaNodeIds.length === 0) &&
    inventories
      .filter((inventory) => inventory.online)
      .every((inventory) => inventory.storedRecordIds.length === records.length);

  return {
    missionNetworkId: topology.missionNetworkId,
    bundleId: bundle.id,
    requiredReplicaNodeIds: onlineNodeIds,
    allReachableNodesHaveAllRecords,
    survivableNodeLoss: allReachableNodesHaveAllRecords &&
      onlineNodeIds.length >= topology.policy.replication.minSurvivorCopies,
    records,
    inventories,
    notes: [
      "All mission records replicate to every currently reachable node.",
      "Raw media follows policy: metadata, hashes, thumbnails, transcripts, and policy-allowed blobs replicate; disallowed raw media stays local with replicated references.",
      "The Rust node agent should persist these records in encrypted local storage and require signed per-record peer acknowledgements.",
    ],
  };
}

function collectReplicationPayloads(
  bundle: CaskBundle,
  resolution: DistributedResolutionReport,
  tagPlan: TrainingTagPlan,
): ReplicationPayload[] {
  return [
    record("bundle_manifest", bundle.id, bundle.sourceNodeId, "review_needed", {
      id: bundle.id,
      missionId: bundle.missionId,
      createdAt: bundle.createdAt,
      sourceNodeId: bundle.sourceNodeId,
      filteringDecision: bundle.filteringDecision,
      priority: bundle.priority,
    }),
    ...bundle.sensorEvents.map((event) =>
      record("sensor_event", event.id, event.sourceNodeId, event.policyState, event)
    ),
    ...bundle.locationFixes.map((fix) =>
      record("location_fix", fix.id, bundle.sourceNodeId, fix.policyState, fix)
    ),
    ...bundle.droneObservations.map((observation) =>
      record("drone_observation", observation.id, observation.sourceNodeId, observation.policyState, observation)
    ),
    ...bundle.controlSourceEstimates.map((estimate) =>
      record("control_source_estimate", estimate.id, bundle.sourceNodeId, estimate.policyState, estimate)
    ),
    ...bundle.counterUasCues.map((cue) =>
      record("counter_uas_cue", cue.id, bundle.sourceNodeId, cue.policyGate, cue)
    ),
    ...bundle.nodeHealth.map((health) =>
      record("node_health", `health-${health.nodeId}-${health.observedAt}`, health.nodeId, "review_needed", health)
    ),
    ...resolution.contributions.map((contribution) =>
      record(
        "peer_intent",
        `intent-${contribution.nodeId}-${contribution.peerIntent.trackId}`,
        contribution.nodeId,
        contribution.peerIntent.policyState,
        contribution.peerIntent,
      )
    ),
    record("training_tag_plan", tagPlan.objectiveId, tagPlan.selectedNodeId ?? bundle.sourceNodeId, tagPlan.policyGate, tagPlan),
  ];
}

function record(
  kind: ReplicationRecordKind,
  recordId: string,
  sourceNodeId: string,
  policyState: PolicyState,
  payload: unknown,
): ReplicationPayload {
  return {
    recordId,
    kind,
    sourceNodeId,
    policyState,
    payload,
  };
}

function buildRecord(payload: ReplicationPayload, requiredReplicaNodeIds: string[]): ReplicatedRecord {
  return {
    recordId: payload.recordId,
    kind: payload.kind,
    sourceNodeId: payload.sourceNodeId,
    policyState: payload.policyState,
    contentHash: hashPayload(payload.payload),
    signedByNodeId: payload.sourceNodeId,
    encryptedAtRest: true,
    requiredReplicaNodeIds,
    replicatedToNodeIds: requiredReplicaNodeIds,
    missingReplicaNodeIds: [],
  };
}

function buildInventories(
  topology: MeshTopology,
  records: ReplicatedRecord[],
  onlineNodeIds: string[],
): NodeReplicationInventory[] {
  const recordIds = records.map((record) => record.recordId);
  return topology.nodes.map((node) => ({
    nodeId: node.id,
    online: onlineNodeIds.includes(node.id),
    storedRecordIds: onlineNodeIds.includes(node.id) ? recordIds : [],
  }));
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

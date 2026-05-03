import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import { buildReplicationReport } from "../mesh/replication.js";

const bundle = buildSampleBundle();
const resolution = buildDistributedResolutionReport(bundle);
const tagPlan = buildTrainingTagPlan(bundle, resolution);

const nominalReport = buildReplicationReport(
  defaultDdilMeshTopology,
  bundle,
  resolution,
  tagPlan,
  nominalMeshObservations,
);

if (!nominalReport.allReachableNodesHaveAllRecords) {
  throw new Error("Expected every reachable node to store every mission record.");
}

const failedHubResolution = buildDistributedResolutionReport(bundle, { offlineNodeIds: ["altiair-hub"] });
const failedHubTagPlan = buildTrainingTagPlan(bundle, failedHubResolution);
const failedHubReport = buildReplicationReport(
  defaultDdilMeshTopology,
  bundle,
  failedHubResolution,
  failedHubTagPlan,
  nominalMeshObservations,
  { offlineNodeIds: ["altiair-hub"] },
);

const onlineInventories = failedHubReport.inventories.filter((inventory) => inventory.online);
if (!failedHubReport.allReachableNodesHaveAllRecords || onlineInventories.length !== 3) {
  throw new Error("Expected every surviving node to keep the full mission ledger after hub loss.");
}

for (const inventory of onlineInventories) {
  if (inventory.storedRecordIds.length !== failedHubReport.records.length) {
    throw new Error(`${inventory.nodeId} is missing replicated records after hub loss.`);
  }
}

console.log(
  JSON.stringify(
    {
      nominal: {
        recordCount: nominalReport.records.length,
        replicaNodeIds: nominalReport.requiredReplicaNodeIds,
        allReachableNodesHaveAllRecords: nominalReport.allReachableNodesHaveAllRecords,
        survivableNodeLoss: nominalReport.survivableNodeLoss,
      },
      failedHub: {
        recordCount: failedHubReport.records.length,
        replicaNodeIds: failedHubReport.requiredReplicaNodeIds,
        allReachableNodesHaveAllRecords: failedHubReport.allReachableNodesHaveAllRecords,
        survivableNodeLoss: failedHubReport.survivableNodeLoss,
      },
    },
    null,
    2,
  ),
);

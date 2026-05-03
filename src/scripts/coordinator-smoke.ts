import { buildCoordinatorDirective } from "../mesh/coordinator.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";
import { buildCaskBundleFromLiveInputs } from "../sensors/liveMerge.js";
import { buildCaskDemoMockScenario } from "../mock/caskDemoScenario.js";

const scenario = buildCaskDemoMockScenario();
const finalStep = scenario.steps[scenario.steps.length - 1];
if (finalStep === undefined) {
  throw new Error("Mock scenario has no final step.");
}

const bundle = buildCaskBundleFromLiveInputs(finalStep.events, {
  missionId: scenario.missionId,
  sourceNodeId: "altiair-hub",
  bundleId: `bundle-${scenario.missionId}-${finalStep.id}`,
  createdAt: new Date("2026-05-03T05:00:45.000Z"),
});
const observations = nominalMeshObservations.map((observation) =>
  observation.nodeId === "altiair-node-b"
    ? {
        ...observation,
        online: false,
        lastSeenSeconds: 3,
        queueDepth: 8,
        cpuLoad: 0.91,
        foundryReachable: false,
        internetReachable: false,
      }
    : observation
);
const offlineNodeIds = observations.filter((observation) => !observation.online).map((observation) => observation.nodeId);
const resolution = buildDistributedResolutionReport(bundle, { offlineNodeIds });
const tagPlan = buildTrainingTagPlan(bundle, resolution);
const directive = buildCoordinatorDirective(
  defaultDdilMeshTopology,
  observations,
  bundle.id,
  bundle.missionId,
  tagPlan,
  undefined,
  {
    localNodeId: "altiair-hub",
    model: "gemma3:1b",
    mode: "mock",
    createdAt: new Date("2026-05-03T05:00:45.000Z"),
  },
);

if (directive.election.leaderId === null) {
  throw new Error("Expected a coordinator leader with three online nodes.");
}
if (directive.election.leaderId !== "altiair-hub") {
  throw new Error(`Expected altiair-hub leader, got ${directive.election.leaderId}.`);
}
if (directive.gossipWorld.failedNodeIds[0] !== "altiair-node-b") {
  throw new Error("Expected altiair-node-b to be the failed node.");
}
if (Object.keys(directive.instructions).length < 3) {
  throw new Error("Expected instructions for the surviving quorum.");
}

console.log(JSON.stringify({
  coordinatorLeader: directive.election.leaderId,
  term: directive.election.term,
  authorityState: directive.election.authorityState,
  votingNodeIds: directive.election.votingNodeIds,
  failedNodeIds: directive.gossipWorld.failedNodeIds,
  instructionNodeIds: Object.keys(directive.instructions).sort(),
}, null, 2));

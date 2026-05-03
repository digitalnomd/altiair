import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import {
  assessMissionContinuity,
  decideCongestion,
  selectGateway,
} from "../mesh/gatewaySelection.js";

const nominalDecision = selectGateway(defaultDdilMeshTopology, nominalMeshObservations, {
  currentGatewayId: "altiair-hub",
});

const degradedObservations = nominalMeshObservations.map((observation) =>
  observation.nodeId === "altiair-hub"
    ? {
        ...observation,
        foundryReachable: false,
        internetReachable: false,
        recentUploadSuccess: false,
        queueDepth: 275,
        packetLoss: 0.12,
      }
    : observation,
);

const degradedDecision = selectGateway(defaultDdilMeshTopology, degradedObservations, {
  currentGatewayId: "altiair-hub",
});

const failedHubObservations = nominalMeshObservations.map((observation) =>
  observation.nodeId === "altiair-hub"
    ? {
        ...observation,
        online: false,
        foundryReachable: false,
        internetReachable: false,
        recentUploadSuccess: false,
      }
    : observation,
);

const failedEdgeObservations = nominalMeshObservations.map((observation) =>
  observation.nodeId === "altiair-node-a"
    ? {
        ...observation,
        online: false,
      }
    : observation,
);

const selectedObservation = nominalMeshObservations.find(
  (observation) => observation.nodeId === nominalDecision.selectedGatewayId,
);
if (selectedObservation === undefined) {
  throw new Error("Nominal gateway selection did not return an observed node.");
}

const congestion = decideCongestion(
  defaultDdilMeshTopology,
  selectedObservation,
  11 * 1024 * 1024,
  0.2,
  "review_needed",
);

console.log(
  JSON.stringify(
    {
      topology: defaultDdilMeshTopology.missionNetworkId,
      nominalDecision,
      degradedDecision,
      failedHubContinuity: assessMissionContinuity(
        defaultDdilMeshTopology,
        failedHubObservations,
        "altiair-hub",
      ),
      failedEdgeContinuity: assessMissionContinuity(
        defaultDdilMeshTopology,
        failedEdgeObservations,
        "altiair-hub",
      ),
      largeReviewBundleCongestion: congestion,
    },
    null,
    2,
  ),
);

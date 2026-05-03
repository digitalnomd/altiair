import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildTrainingTagPlan } from "../cask/trainingTag.js";

const bundle = buildSampleBundle();
const fullReport = buildDistributedResolutionReport(bundle);
const stagedPlan = buildTrainingTagPlan(bundle, fullReport);

if (stagedPlan.executionState !== "awaiting_operator_authorization") {
  throw new Error(`Expected review-needed tag plan to wait for operator authorization, got ${stagedPlan.executionState}.`);
}

const authorizedBundle = {
  ...bundle,
  counterUasCues: bundle.counterUasCues.map((cue) => ({
    ...cue,
    policyGate: "authorized_to_share" as const,
  })),
};
const authorizedPlan = buildTrainingTagPlan(
  authorizedBundle,
  buildDistributedResolutionReport(authorizedBundle, { offlineNodeIds: ["altiair-hub"] }),
  { operatorAuthorized: true, tagMethod: "qr_scan" },
);

if (authorizedPlan.executionState !== "ready_for_non_contact_tag") {
  throw new Error(`Expected authorized peer tag plan to be ready, got ${authorizedPlan.executionState}.`);
}
if (!authorizedPlan.degraded || !authorizedPlan.resolvedByPeerMesh) {
  throw new Error("Expected one-node-failed authorized plan to remain degraded but peer-resolved.");
}

const belowQuorumPlan = buildTrainingTagPlan(
  authorizedBundle,
  buildDistributedResolutionReport(authorizedBundle, {
    offlineNodeIds: ["altiair-node-a", "altiair-orin"],
  }),
  { operatorAuthorized: true },
);

if (belowQuorumPlan.executionState !== "below_quorum_collect_more") {
  throw new Error(`Expected below-quorum plan to collect more, got ${belowQuorumPlan.executionState}.`);
}

console.log(JSON.stringify({ stagedPlan, authorizedPlan, belowQuorumPlan }, null, 2));

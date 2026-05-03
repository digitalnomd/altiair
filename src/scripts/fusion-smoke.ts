import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";

const bundle = buildSampleBundle();
const report = buildDistributedResolutionReport(bundle);

if (!report.resolvedByQuorum || !report.resolvedByPeerMesh) {
  throw new Error(
    `Expected full mesh quorum to resolve the scenario. Missing nodes: ${report.missingNodeIds.join(", ") || "none"}.`,
  );
}

if (report.selectedNodeId !== "altiair-node-a") {
  throw new Error(`Expected closest RFID node to own active tag role, got ${report.selectedNodeId ?? "none"}.`);
}

for (const contribution of report.contributions) {
  if (contribution.localConfidence >= report.localResolutionThreshold) {
    throw new Error(
      `${contribution.nodeId} resolves alone at ${contribution.localConfidence}; demo must stay fusion-only.`,
    );
  }
  if (contribution.peerIntent.exclusiveGroup === report.selectedIntent?.exclusiveGroup &&
    contribution.nodeId !== report.selectedNodeId &&
    contribution.leasePriority > (report.contributions.find((item) => item.nodeId === report.selectedNodeId)?.leasePriority ?? 0)
  ) {
    throw new Error(`${contribution.nodeId} has a conflicting higher-priority lease.`);
  }
}

const oneNodeFailureReports = report.candidateNodeIds.map((nodeId) =>
  buildDistributedResolutionReport(bundle, { offlineNodeIds: [nodeId] }),
);
for (const degradedReport of oneNodeFailureReports) {
  if (!degradedReport.resolvedByQuorum || !degradedReport.resolvedByPeerMesh || !degradedReport.degraded) {
    throw new Error(
      `Expected one-node failure to remain resolvable. Missing nodes: ${degradedReport.missingNodeIds.join(", ")}.`,
    );
  }
}

const twoNodeFailureReport = buildDistributedResolutionReport(bundle, {
  offlineNodeIds: ["altiair-hub", "altiair-orin"],
});
if (twoNodeFailureReport.resolvedByQuorum || twoNodeFailureReport.resolvedByPeerMesh) {
  throw new Error("Expected two-node failure to drop below quorum.");
}

console.log(JSON.stringify({ report, oneNodeFailureReports, twoNodeFailureReport }, null, 2));

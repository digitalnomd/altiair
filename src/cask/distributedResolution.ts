import type { CaskBundle } from "./types.js";

export interface NodeResolutionContribution {
  nodeId: string;
  role: string;
  evidenceIds: string[];
  localConfidence: number;
  localReadout: string;
  whyInconclusiveAlone: string;
}

export interface DistributedResolutionReport {
  scenarioId: string;
  candidateNodeIds: string[];
  minimumQuorumNodes: number;
  contributingNodeIds: string[];
  missingNodeIds: string[];
  localResolutionThreshold: number;
  fusedConfidence: number;
  resolvedByQuorum: boolean;
  degraded: boolean;
  conclusion: string;
  quorumReasons: string[];
  contributions: NodeResolutionContribution[];
}

export interface DistributedResolutionOptions {
  offlineNodeIds?: string[];
}

const CANDIDATE_NODE_IDS = [
  "altiair-node-a",
  "altiair-node-b",
  "altiair-orin",
  "altiair-hub",
];

const LOCAL_RESOLUTION_THRESHOLD = 0.7;
const MINIMUM_QUORUM_NODES = 3;

export function buildDistributedResolutionReport(
  bundle: CaskBundle,
  options: DistributedResolutionOptions = {},
): DistributedResolutionReport {
  const offlineNodeIds = new Set(options.offlineNodeIds ?? []);
  const contributions = buildContributions(bundle, offlineNodeIds);
  const contributingNodeIds = contributions
    .filter((contribution) => contribution.evidenceIds.length > 0)
    .map((contribution) => contribution.nodeId);
  const missingNodeIds = CANDIDATE_NODE_IDS.filter((nodeId) => !contributingNodeIds.includes(nodeId));
  const allLocalReadoutsAreAmbiguous = contributions.every(
    (contribution) => contribution.localConfidence < LOCAL_RESOLUTION_THRESHOLD,
  );
  const quorumAvailable = contributingNodeIds.length >= MINIMUM_QUORUM_NODES;
  const resolvedByQuorum = quorumAvailable && allLocalReadoutsAreAmbiguous;
  const fusedConfidence = resolvedByQuorum
    ? quorumConfidenceFrom(bundle, contributingNodeIds.length)
    : Math.min(0.58, fusedConfidenceFrom(bundle));

  return {
    scenarioId: bundle.missionId,
    candidateNodeIds: CANDIDATE_NODE_IDS,
    minimumQuorumNodes: MINIMUM_QUORUM_NODES,
    contributingNodeIds,
    missingNodeIds,
    localResolutionThreshold: LOCAL_RESOLUTION_THRESHOLD,
    fusedConfidence,
    resolvedByQuorum: resolvedByQuorum && fusedConfidence >= LOCAL_RESOLUTION_THRESHOLD,
    degraded: missingNodeIds.length > 0,
    conclusion:
      "Any surviving three-node quorum can fuse enough cross-node evidence to produce a policy-gated training cue.",
    quorumReasons: [
      "RFID identity, audio cue, visual marker, and cached mission context live on different nodes.",
      "Every single-node readout remains below the resolution threshold.",
      "The fused cue crosses threshold through replicated peer evidence, not a single central authority.",
      "The Pi 5 may coordinate when online, but the Jetson or a Pi peer can take over the quorum role.",
      "The result remains a review cue with uncertainty and policy state, not an autonomous action.",
    ],
    contributions,
  };
}

function buildContributions(bundle: CaskBundle, offlineNodeIds: Set<string>): NodeResolutionContribution[] {
  return [
    {
      nodeId: "altiair-node-a",
      role: "Pi 4B RFID/location surrogate",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-node-a", offlineNodeIds),
      localConfidence: 0.62,
      localReadout: "Tagged training subject or asset is near the checkpoint.",
      whyInconclusiveAlone: "RFID gives identity or presence, but not intent, visual class, or surrounding context.",
    },
    {
      nodeId: "altiair-node-b",
      role: "Pi 4B audio/micro-observation",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-node-b", offlineNodeIds),
      localConfidence: 0.46,
      localReadout: "Audio signature or nearby activity is unusual in the same time window.",
      whyInconclusiveAlone: "Audio is ambiguous without identity, visual corroboration, and mission context.",
    },
    {
      nodeId: "altiair-orin",
      role: "Jetson Orin Nano visual inference",
      evidenceIds: evidenceIdsUnlessOffline(bundle, "altiair-orin", offlineNodeIds),
      localConfidence: 0.57,
      localReadout: "Visual model sees a simulated aerial-object marker or relevant movement.",
      whyInconclusiveAlone: "Vision sees an object or marker, but cannot connect it to a tagged subject or policy gate.",
    },
    {
      nodeId: "altiair-hub",
      role: "Pi 5 display/coordinator candidate with replicated CASK context",
      evidenceIds: offlineNodeIds.has("altiair-hub")
        ? []
        : [
            ...bundle.counterUasCues.map((cue) => cue.id),
            ...bundle.controlSourceEstimates.map((estimate) => estimate.id),
          ],
      localConfidence: 0.52,
      localReadout: "Replicated mission ontology says the tag, zone, and event type are relevant to the training lane.",
      whyInconclusiveAlone: "Mission context is not a fresh observation until edge nodes provide evidence.",
    },
  ];
}

function evidenceIdsUnlessOffline(
  bundle: CaskBundle,
  nodeId: string,
  offlineNodeIds: Set<string>,
): string[] {
  return offlineNodeIds.has(nodeId) ? [] : idsForNode(bundle, nodeId);
}

function idsForNode(bundle: CaskBundle, nodeId: string): string[] {
  return [
    ...bundle.sensorEvents
      .filter((event) => event.sourceNodeId === nodeId)
      .map((event) => event.id),
    ...bundle.droneObservations
      .filter((observation) => observation.sourceNodeId === nodeId)
      .map((observation) => observation.id),
  ];
}

function fusedConfidenceFrom(bundle: CaskBundle): number {
  const cueConfidence = bundle.counterUasCues[0]?.confidence;
  return typeof cueConfidence === "number" ? cueConfidence : 0.74;
}

function quorumConfidenceFrom(bundle: CaskBundle, contributingNodeCount: number): number {
  if (contributingNodeCount >= CANDIDATE_NODE_IDS.length) {
    return fusedConfidenceFrom(bundle);
  }
  return Math.min(fusedConfidenceFrom(bundle), 0.71);
}

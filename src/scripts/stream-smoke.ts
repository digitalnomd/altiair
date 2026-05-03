import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildDistributedResolutionReport } from "../cask/distributedResolution.js";
import { buildTrainingTagPlan, type TrainingTagPlan } from "../cask/trainingTag.js";
import type { CaskBundle } from "../cask/types.js";
import { buildCaskLlmContextPack } from "../llm/caskContext.js";
import { buildCoordinatorDirective, type CoordinatorDirective } from "../mesh/coordinator.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";
import {
  buildBundleStreamRecords,
  buildFoundrySyncStreamRecord,
  buildStreamStatus,
  toKafkaMessage,
} from "../stream/alwaysOn.js";

const bundle = buildSampleBundle(new Date("2026-05-03T07:30:00.000Z"));
const context = buildCaskLlmContextPack(bundle);
const resolution = buildDistributedResolutionReport(bundle);
const tagPlan = buildTrainingTagPlan(bundle, resolution);
const coordinator = buildFallbackCoordinatorDirective(bundle, tagPlan);

const append = buildBundleStreamRecords({
  bundle,
  context,
  producerNodeId: "altiair-hub",
  sequenceStart: 1,
  insight: {
    id: "insight-stream-smoke",
    bundleId: bundle.id,
    model: "gemma4:e2b",
    createdAt: bundle.createdAt,
    summary: "Stream smoke insight over CASK evidence.",
    confidence: 0.7,
    limitations: ["Smoke fixture only."],
    evidenceIds: ["provider-style-loc-demo-001"],
    recommendedNextChecks: ["Verify stream delivery shape."],
    policyState: "review_needed",
  },
  coordinator,
  ingestedAt: new Date("2026-05-03T07:30:01.000Z"),
});

const foundryRecord = buildFoundrySyncStreamRecord({
  ack: {
    id: "foundry-stream-smoke",
    bundleId: bundle.id,
    mode: "osdk",
    uploadedAt: "2026-05-03T07:30:02.000Z",
    status: "accepted",
    appliedActions: ["createExampleCaskGpsPosition"],
  },
  missionId: bundle.missionId,
  producerNodeId: "altiair-hub",
  sourceNodeId: "altiair-hub",
  sequence: append.nextSequence,
  ingestedAt: new Date("2026-05-03T07:30:02.000Z"),
});

const records = [...append.records, foundryRecord];
const status = buildStreamStatus(records);
const topics = new Set(records.map((record) => record.topic));
for (const required of [
  "altiair.cask.sensor.v1",
  "altiair.cask.location.v1",
  "altiair.cask.health.v1",
  "altiair.cask.cue.v1",
  "altiair.cask.insight.v1",
  "altiair.cask.coordinator.v1",
  "altiair.cask.foundry-sync.v1",
]) {
  if (!topics.has(required as never)) {
    throw new Error(`Expected stream topic ${required}.`);
  }
}

const kafkaMessage = toKafkaMessage(records[0]!);
const parsed = JSON.parse(kafkaMessage.value) as { schemaVersion?: unknown; sequence?: unknown };
if (parsed.schemaVersion !== "altiair-cask-stream-v1" || parsed.sequence !== 1) {
  throw new Error("Kafka-shaped stream message did not preserve schema version and sequence.");
}

console.log(JSON.stringify({
  streamSmoke: "passed",
  totalRecords: status.totalRecords,
  latestSequence: status.latestSequence,
  topics: status.topics.filter((topic) => topic.count > 0),
  kafkaMessagePreview: {
    topic: kafkaMessage.topic,
    key: kafkaMessage.key,
    headers: kafkaMessage.headers,
  },
}, null, 2));

function buildFallbackCoordinatorDirective(
  bundle: CaskBundle,
  tagPlan: TrainingTagPlan,
): CoordinatorDirective {
  return buildCoordinatorDirective(
    defaultDdilMeshTopology,
    nominalMeshObservations,
    bundle.id,
    bundle.missionId,
    tagPlan,
    undefined,
    {
      localNodeId: "altiair-hub",
      model: "gemma4:e2b",
      mode: "mock",
      createdAt: new Date(bundle.createdAt),
    },
  );
}

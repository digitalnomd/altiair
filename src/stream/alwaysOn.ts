import type { CaskLlmContextPack } from "../llm/caskContext.js";
import type { CoordinatorDirective } from "../mesh/coordinator.js";
import type {
  CaskBundle,
  InsightDraft,
  PolicyState,
  UploadAck,
} from "../cask/types.js";

export const caskStreamTopicDefinitions = [
  {
    topic: "altiair.cask.sensor.v1",
    purpose: "Always-on camera, audio, RFID, and provider-style location observations.",
  },
  {
    topic: "altiair.cask.location.v1",
    purpose: "Normalized CASK location fixes with precision, freshness, policy, and provider envelope.",
  },
  {
    topic: "altiair.cask.health.v1",
    purpose: "Node health, model status, mesh reachability, and Foundry reachability.",
  },
  {
    topic: "altiair.cask.cue.v1",
    purpose: "Policy-gated CASK cue objects for display and human review.",
  },
  {
    topic: "altiair.cask.insight.v1",
    purpose: "Gemma/local-LLM insight drafts over CASK evidence and Foundry context.",
  },
  {
    topic: "altiair.cask.coordinator.v1",
    purpose: "Single-leader coordinator directives and per-node instruction maps.",
  },
  {
    topic: "altiair.cask.foundry-sync.v1",
    purpose: "Foundry upload acknowledgements and commander-sync state.",
  },
] as const;

export type CaskStreamTopic = typeof caskStreamTopicDefinitions[number]["topic"];

export interface CaskStreamRecord<TPayload = unknown> {
  schemaVersion: "altiair-cask-stream-v1";
  streamRecordId: string;
  topic: CaskStreamTopic;
  key: string;
  partitionKey: string;
  sequence: number;
  missionId: string;
  producerNodeId: string;
  sourceNodeId: string;
  eventTime: string;
  ingestedAt: string;
  policyState: PolicyState;
  caskContext?: {
    schemaVersion: CaskLlmContextPack["schemaVersion"];
    demoMode: CaskLlmContextPack["demoMode"];
    foundryMode: CaskLlmContextPack["foundry"]["mode"];
    foundryConnected: boolean;
    ontologyObjectCount: number;
    providerProfiles: string[];
  };
  payload: TPayload;
}

export interface KafkaMessageShape {
  topic: CaskStreamTopic;
  key: string;
  value: string;
  headers: Record<string, string>;
}

export interface StreamAppendResult {
  records: CaskStreamRecord[];
  nextSequence: number;
}

export interface StreamStatus {
  totalRecords: number;
  latestSequence: number;
  topics: Array<{
    topic: CaskStreamTopic;
    purpose: string;
    count: number;
    latestSequence: number | null;
  }>;
}

export function buildBundleStreamRecords(input: {
  bundle: CaskBundle;
  producerNodeId: string;
  sequenceStart: number;
  context?: CaskLlmContextPack;
  insight?: InsightDraft;
  coordinator?: CoordinatorDirective;
  ingestedAt?: Date;
}): StreamAppendResult {
  let sequence = input.sequenceStart;
  const records: CaskStreamRecord[] = [];
  const ingestedAt = (input.ingestedAt ?? new Date()).toISOString();

  for (const event of input.bundle.sensorEvents) {
    records.push(record({
      topic: "altiair.cask.sensor.v1",
      key: event.id,
      partitionKey: event.sourceNodeId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: event.sourceNodeId,
      eventTime: event.observedAt,
      ingestedAt,
      policyState: event.policyState,
      context: input.context,
      payload: event,
    }));
  }

  for (const fix of input.bundle.locationFixes) {
    records.push(record({
      topic: "altiair.cask.location.v1",
      key: fix.id,
      partitionKey: fix.entityId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: input.bundle.sourceNodeId,
      eventTime: fix.observedAt,
      ingestedAt,
      policyState: fix.policyState,
      context: input.context,
      payload: fix,
    }));
  }

  for (const health of input.bundle.nodeHealth) {
    records.push(record({
      topic: "altiair.cask.health.v1",
      key: `${health.nodeId}:${health.observedAt}`,
      partitionKey: health.nodeId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: health.nodeId,
      eventTime: health.observedAt,
      ingestedAt,
      policyState: "review_needed",
      context: input.context,
      payload: health,
    }));
  }

  for (const cue of input.bundle.counterUasCues) {
    records.push(record({
      topic: "altiair.cask.cue.v1",
      key: cue.id,
      partitionKey: input.bundle.missionId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: input.bundle.sourceNodeId,
      eventTime: cue.createdAt,
      ingestedAt,
      policyState: cue.policyGate,
      context: input.context,
      payload: cue,
    }));
  }

  if (input.insight !== undefined) {
    records.push(record({
      topic: "altiair.cask.insight.v1",
      key: input.insight.id,
      partitionKey: input.bundle.missionId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: input.bundle.sourceNodeId,
      eventTime: input.insight.createdAt,
      ingestedAt,
      policyState: input.insight.policyState,
      context: input.context,
      payload: input.insight,
    }));
  }

  if (input.coordinator !== undefined) {
    records.push(record({
      topic: "altiair.cask.coordinator.v1",
      key: input.coordinator.id,
      partitionKey: input.coordinator.election.leaderId ?? input.bundle.missionId,
      sequence: sequence++,
      bundle: input.bundle,
      producerNodeId: input.producerNodeId,
      sourceNodeId: input.coordinator.election.leaderId ?? input.producerNodeId,
      eventTime: input.coordinator.createdAt,
      ingestedAt,
      policyState: policyStateFromString(input.coordinator.policyGate),
      context: input.context,
      payload: input.coordinator,
    }));
  }

  return { records, nextSequence: sequence };
}

export function buildFoundrySyncStreamRecord(input: {
  ack: UploadAck;
  missionId: string;
  producerNodeId: string;
  sourceNodeId: string;
  sequence: number;
  ingestedAt?: Date;
}): CaskStreamRecord<UploadAck> {
  const ingestedAt = (input.ingestedAt ?? new Date()).toISOString();
  return {
    schemaVersion: "altiair-cask-stream-v1",
    streamRecordId: `stream-${input.sequence}-${sanitize(input.ack.id)}`,
    topic: "altiair.cask.foundry-sync.v1",
    key: input.ack.id,
    partitionKey: input.ack.bundleId,
    sequence: input.sequence,
    missionId: input.missionId,
    producerNodeId: input.producerNodeId,
    sourceNodeId: input.sourceNodeId,
    eventTime: input.ack.uploadedAt,
    ingestedAt,
    policyState: input.ack.status === "failed" ? "review_needed" : "authorized_to_share",
    payload: input.ack,
  };
}

export function buildStreamStatus(records: CaskStreamRecord[]): StreamStatus {
  return {
    totalRecords: records.length,
    latestSequence: records.at(-1)?.sequence ?? 0,
    topics: caskStreamTopicDefinitions.map((definition) => {
      const topicRecords = records.filter((record) => record.topic === definition.topic);
      return {
        topic: definition.topic,
        purpose: definition.purpose,
        count: topicRecords.length,
        latestSequence: topicRecords.at(-1)?.sequence ?? null,
      };
    }),
  };
}

export function filterStreamRecords(
  records: CaskStreamRecord[],
  options: {
    topic?: string;
    afterSequence?: number;
    limit?: number;
  } = {},
): CaskStreamRecord[] {
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  return records
    .filter((record) => options.topic === undefined || record.topic === options.topic)
    .filter((record) => options.afterSequence === undefined || record.sequence > options.afterSequence)
    .slice(0, limit);
}

export function toKafkaMessage(record: CaskStreamRecord): KafkaMessageShape {
  return {
    topic: record.topic,
    key: record.key,
    value: JSON.stringify(record),
    headers: {
      schemaVersion: record.schemaVersion,
      missionId: record.missionId,
      producerNodeId: record.producerNodeId,
      sourceNodeId: record.sourceNodeId,
      policyState: record.policyState,
      sequence: String(record.sequence),
    },
  };
}

function record<TPayload>(input: {
  topic: CaskStreamTopic;
  key: string;
  partitionKey: string;
  sequence: number;
  bundle: CaskBundle;
  producerNodeId: string;
  sourceNodeId: string;
  eventTime: string;
  ingestedAt: string;
  policyState: PolicyState;
  context?: CaskLlmContextPack;
  payload: TPayload;
}): CaskStreamRecord<TPayload> {
  return {
    schemaVersion: "altiair-cask-stream-v1",
    streamRecordId: `stream-${input.sequence}-${sanitize(input.key)}`,
    topic: input.topic,
    key: input.key,
    partitionKey: input.partitionKey,
    sequence: input.sequence,
    missionId: input.bundle.missionId,
    producerNodeId: input.producerNodeId,
    sourceNodeId: input.sourceNodeId,
    eventTime: input.eventTime,
    ingestedAt: input.ingestedAt,
    policyState: input.policyState,
    caskContext: input.context === undefined ? undefined : {
      schemaVersion: input.context.schemaVersion,
      demoMode: input.context.demoMode,
      foundryMode: input.context.foundry.mode,
      foundryConnected: input.context.foundry.connected,
      ontologyObjectCount: input.context.ontology.objectTypes.length,
      providerProfiles: input.context.evidence.providerProfiles,
    },
    payload: input.payload,
  };
}

function policyStateFromString(value: string): PolicyState {
  return value === "collect_only" ||
    value === "review_needed" ||
    value === "authorized_to_share" ||
    value === "blocked"
    ? value
    : "review_needed";
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

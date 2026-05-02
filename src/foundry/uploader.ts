import type { FoundryConfig } from "../config.js";
import { requireFoundryConfig } from "../config.js";
import type {
  CaskBundle,
  CounterUasCue,
  InsightDraft,
  LocationFix,
  NodeHealth,
  SensorEvent,
  UploadAck,
} from "../cask/types.js";
import { createFoundryOsdkRuntime, type FoundryOsdkRuntime } from "./osdkClient.js";

export interface FoundryUploader {
  uploadBundle(bundle: CaskBundle, insight: InsightDraft): Promise<UploadAck>;
}

export function createFoundryUploader(config: FoundryConfig): FoundryUploader {
  if (config.mode === "mock") {
    return new MockFoundryUploader();
  }
  return new OsdkFoundryUploader(config);
}

class MockFoundryUploader implements FoundryUploader {
  async uploadBundle(bundle: CaskBundle, insight: InsightDraft): Promise<UploadAck> {
    return {
      id: `mock-ack-${bundle.id}`,
      bundleId: bundle.id,
      mode: "mock",
      uploadedAt: new Date().toISOString(),
      status: "queued",
      appliedActions: [
        "mock:createSensorObservation",
        "mock:createLocationFix",
        "mock:createCounterUasCue",
        "mock:createInsightDraft",
        "mock:upsertNodeHealth",
      ],
      message: `Mock accepted ${bundle.sensorEvents.length} sensor events, ${bundle.locationFixes.length} location fixes, ${bundle.counterUasCues.length} cues, and insight ${insight.id}.`,
    };
  }
}

class OsdkFoundryUploader implements FoundryUploader {
  private runtimePromise?: Promise<FoundryOsdkRuntime>;

  constructor(private readonly config: FoundryConfig) {}

  async uploadBundle(bundle: CaskBundle, insight: InsightDraft): Promise<UploadAck> {
    const runtime = await this.runtime();
    const edits: unknown[] = [];
    const appliedActions: string[] = [];

    for (const event of bundle.sensorEvents) {
      edits.push(await this.apply(runtime, this.config.actions.createSensorObservation, event));
      appliedActions.push(this.config.actions.createSensorObservation);
    }

    for (const fix of bundle.locationFixes) {
      edits.push(await this.apply(runtime, this.config.actions.createLocationFix, fix));
      appliedActions.push(this.config.actions.createLocationFix);
    }

    for (const cue of bundle.counterUasCues) {
      edits.push(await this.apply(runtime, this.config.actions.createCounterUasCue, cue));
      appliedActions.push(this.config.actions.createCounterUasCue);
    }

    for (const health of bundle.nodeHealth) {
      edits.push(await this.apply(runtime, this.config.actions.upsertNodeHealth, health));
      appliedActions.push(this.config.actions.upsertNodeHealth);
    }

    edits.push(await this.apply(runtime, this.config.actions.createInsightDraft, insight));
    appliedActions.push(this.config.actions.createInsightDraft);

    return {
      id: `foundry-ack-${bundle.id}`,
      bundleId: bundle.id,
      mode: "osdk",
      uploadedAt: new Date().toISOString(),
      status: "accepted",
      appliedActions,
      foundryEdits: edits,
    };
  }

  private runtime(): Promise<FoundryOsdkRuntime> {
    this.runtimePromise ??= createFoundryOsdkRuntime(requireFoundryConfig(this.config));
    return this.runtimePromise;
  }

  private apply(
    runtime: FoundryOsdkRuntime,
    actionExportName: string,
    item: SensorEvent | LocationFix | CounterUasCue | NodeHealth | InsightDraft,
  ): Promise<unknown> {
    return runtime.applyAction(actionExportName, this.toActionPayload(item));
  }

  private toActionPayload(
    item: SensorEvent | LocationFix | CounterUasCue | NodeHealth | InsightDraft,
  ): Record<string, unknown> {
    if (this.config.actionPayloadStyle === "raw") {
      return item as unknown as Record<string, unknown>;
    }

    const maybeEvent = item as Partial<SensorEvent>;
    const maybeInsight = item as Partial<InsightDraft>;
    const maybeCue = item as Partial<CounterUasCue>;
    const externalId =
      maybeEvent.id ??
      maybeInsight.id ??
      (item as Partial<LocationFix>).id ??
      (item as Partial<NodeHealth>).nodeId;

    return {
      externalId,
      sourceNodeId: maybeEvent.sourceNodeId,
      observedAt:
        maybeEvent.observedAt ??
        (item as Partial<LocationFix>).observedAt ??
        (item as Partial<NodeHealth>).observedAt ??
        maybeInsight.createdAt ??
        maybeCue.createdAt,
      policyState:
        maybeEvent.policyState ??
        (item as Partial<LocationFix>).policyState ??
        maybeInsight.policyState ??
        maybeCue.policyGate,
      payloadJson: JSON.stringify(item),
    };
  }
}

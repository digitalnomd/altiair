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
    return new MockFoundryUploader(config);
  }
  return new OsdkFoundryUploader(config);
}

class MockFoundryUploader implements FoundryUploader {
  constructor(private readonly config: FoundryConfig) {}

  async uploadBundle(bundle: CaskBundle, insight: InsightDraft): Promise<UploadAck> {
    if (this.config.uploadProfile === "cask_gps_position") {
      return {
        id: `mock-gps-ack-${bundle.id}`,
        bundleId: bundle.id,
        mode: "mock",
        uploadedAt: new Date().toISOString(),
        status: "queued",
        appliedActions: [`mock:${this.config.actions.createCaskGpsPosition}`],
        message: `Mock accepted ${bundle.locationFixes.length} location fixes for the narrow CASK GPS Position profile.`,
      };
    }

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
    if (this.config.uploadProfile === "cask_gps_position") {
      return this.uploadCaskGpsPositions(bundle);
    }

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

  private async uploadCaskGpsPositions(bundle: CaskBundle): Promise<UploadAck> {
    const runtime = await this.runtime();
    const edits: unknown[] = [];
    const appliedActions: string[] = [];

    for (const fix of bundle.locationFixes) {
      edits.push(
        await runtime.applyAction(
          this.config.actions.createCaskGpsPosition,
          this.toCaskGpsPositionPayload(fix),
        ),
      );
      appliedActions.push(this.config.actions.createCaskGpsPosition);
    }

    return {
      id: `foundry-gps-ack-${bundle.id}`,
      bundleId: bundle.id,
      mode: "osdk",
      uploadedAt: new Date().toISOString(),
      status: "accepted",
      appliedActions,
      foundryEdits: edits,
      message:
        "Uploaded location fixes through the narrow CASK GPS Position OSDK profile. Sensor, cue, health, and insight bundle records remain local/mock until matching ontology actions are available.",
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

  private toCaskGpsPositionPayload(fix: LocationFix): Record<string, unknown> {
    const coordinates = fix.coordinates ?? {
      latitude: this.config.caskGpsDefaults.latitude,
      longitude: this.config.caskGpsDefaults.longitude,
    };

    return {
      positionID: fix.id,
      deviceID: fix.entityId,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      altitudeM: this.config.caskGpsDefaults.altitudeM,
      speedKnots: this.config.caskGpsDefaults.speedKnots,
      courseDeg: this.config.caskGpsDefaults.courseDeg,
      fixQuality: this.config.caskGpsDefaults.fixQuality,
      numSatellites: this.config.caskGpsDefaults.numSatellites,
      timestamp: fix.observedAt,
    };
  }
}

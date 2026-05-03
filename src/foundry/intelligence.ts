import type { FoundryConfig } from "../config.js";
import { requireFoundryConfig } from "../config.js";
import { caskOntologyShape } from "../cask/ontology.js";
import { createFoundryOsdkRuntime, type FoundryOsdkRuntime } from "./osdkClient.js";

export interface FoundryIntelligenceOptions {
  missionId?: string;
  pageSize?: number;
  objectExports?: string[];
}

export interface FoundryIntelligenceRecord {
  source: "mock" | "osdk";
  objectExportName: string;
  objectApiName: string;
  primaryKey?: string;
  title?: string;
  observedAt?: string;
  summary: string;
  payloadJson: Record<string, unknown>;
}

export interface FoundryIntelligenceSnapshot {
  mode: "mock" | "osdk";
  connected: boolean;
  pulledAt: string;
  missionId?: string;
  requestedObjectExports: string[];
  generatedObjectExports: string[];
  generatedActionExports: string[];
  unavailableObjectExports: Array<{ exportName: string; reason: string }>;
  records: FoundryIntelligenceRecord[];
  intelligenceBrief: string[];
  recommendedLocalUses: string[];
}

export interface FoundryIntelligenceClient {
  getMissionIntelligence(options?: FoundryIntelligenceOptions): Promise<FoundryIntelligenceSnapshot>;
}

export function createFoundryIntelligenceClient(config: FoundryConfig): FoundryIntelligenceClient {
  if (config.mode === "mock") {
    return new MockFoundryIntelligenceClient(config);
  }
  return new OsdkFoundryIntelligenceClient(config);
}

class MockFoundryIntelligenceClient implements FoundryIntelligenceClient {
  constructor(private readonly config: FoundryConfig) {}

  async getMissionIntelligence(options: FoundryIntelligenceOptions = {}): Promise<FoundryIntelligenceSnapshot> {
    const pulledAt = new Date().toISOString();
    const requestedObjectExports = options.objectExports ?? this.config.intelligenceObjectExports;
    const records = mockRecords(options.missionId, pulledAt);
    return {
      mode: "mock",
      connected: false,
      pulledAt,
      missionId: options.missionId,
      requestedObjectExports,
      generatedObjectExports: ["ExampleCaskGpsPosition"],
      generatedActionExports: ["createExampleCaskGpsPosition"],
      unavailableObjectExports: requestedObjectExports
        .filter((exportName) => !records.some((record) => record.objectExportName === exportName))
        .map((exportName) => ({
          exportName,
          reason: "Mock mode returns the local CASK intelligence shape without contacting Foundry.",
        })),
      records,
      intelligenceBrief: buildBrief(records, "mock"),
      recommendedLocalUses: recommendedUses(),
    };
  }
}

class OsdkFoundryIntelligenceClient implements FoundryIntelligenceClient {
  private runtimePromise?: Promise<FoundryOsdkRuntime>;

  constructor(private readonly config: FoundryConfig) {}

  async getMissionIntelligence(options: FoundryIntelligenceOptions = {}): Promise<FoundryIntelligenceSnapshot> {
    const runtime = await this.runtime();
    const pulledAt = new Date().toISOString();
    const requestedObjectExports = options.objectExports ?? this.config.intelligenceObjectExports;
    const unavailableObjectExports: FoundryIntelligenceSnapshot["unavailableObjectExports"] = [];
    const records: FoundryIntelligenceRecord[] = [];
    const pageSize = clampPageSize(options.pageSize);

    for (const exportName of requestedObjectExports) {
      try {
        const page = await runtime.fetchObjects(exportName, { pageSize });
        for (const item of page.data) {
          records.push(recordFromFoundryObject(page.exportName, page.objectApiName, page.primaryKeyApiName, item));
        }
      } catch (error: unknown) {
        unavailableObjectExports.push({
          exportName,
          reason: error instanceof Error ? error.message : "Unable to fetch object export.",
        });
      }
    }

    return {
      mode: "osdk",
      connected: true,
      pulledAt,
      missionId: options.missionId,
      requestedObjectExports,
      generatedObjectExports: runtime.generatedObjectExportNames(),
      generatedActionExports: runtime.generatedActionExportNames(),
      unavailableObjectExports,
      records,
      intelligenceBrief: buildBrief(records, "osdk"),
      recommendedLocalUses: recommendedUses(),
    };
  }

  private runtime(): Promise<FoundryOsdkRuntime> {
    this.runtimePromise ??= createFoundryOsdkRuntime(requireFoundryConfig(this.config));
    return this.runtimePromise;
  }
}

function mockRecords(missionId: string | undefined, pulledAt: string): FoundryIntelligenceRecord[] {
  const ontologyObjectNames = caskOntologyShape.objectTypes.map((objectType) => objectType.apiName);
  return [
    {
      source: "mock",
      objectExportName: "ExampleCaskGpsPosition",
      objectApiName: "ExampleCaskGpsPosition",
      primaryKey: "gps-training-tag-001",
      title: "Training tag GPS fix",
      observedAt: pulledAt,
      summary: "Foundry GPS-position object anchors the local Hawkeye map overlay to a real latitude/longitude frame.",
      payloadJson: {
        deviceId: "training-tag-001",
        latitude: 37.78984,
        longitude: -122.40128,
        altitudeM: 18,
        speedKnots: 0,
        courseDeg: 343,
        fixQuality: 1,
        numSatellites: 9,
        observedAt: pulledAt,
        sourceSystem: "mock-foundry-osdk",
      },
    },
    {
      source: "mock",
      objectExportName: "CaskDeploymentOrder",
      objectApiName: "CaskDeploymentOrder",
      primaryKey: "deploy-mission-live-edge-map",
      title: "Hawkeye UAS observation deployment",
      observedAt: pulledAt,
      summary: "Mission deployment includes the map anchor, authorized observation area, node coordinates, UAS track, and review-gated control-source estimate.",
      payloadJson: {
        deploymentId: "deploy-mission-live-edge-map",
        missionId: missionId ?? "mission-live-edge",
        authorizedZoneId: "training-zone-alpha",
        sourceLabel: "Foundry deployment: training-zone-alpha",
        map: {
          center: { latitude: 37.78984, longitude: -122.40128 },
          zoom: 15,
        },
        objectiveAreaLabel: "Authorized Observation Area",
        objectiveArea: [
          { latitude: 37.7885, longitude: -122.40185 },
          { latitude: 37.7885, longitude: -122.4005 },
          { latitude: 37.78795, longitude: -122.39998 },
          { latitude: 37.78725, longitude: -122.40015 },
          { latitude: 37.78682, longitude: -122.4012 },
          { latitude: 37.7872, longitude: -122.40205 },
          { latitude: 37.7879, longitude: -122.40218 },
          { latitude: 37.78835, longitude: -122.40155 },
        ],
        nodes: [
          { nodeId: "N1", latitude: 37.78806, longitude: -122.40095 },
          { nodeId: "N2", latitude: 37.78722, longitude: -122.39775 },
          { nodeId: "N3", latitude: 37.78655, longitude: -122.40355 },
          { nodeId: "N4", latitude: 37.79172, longitude: -122.40478 },
          { nodeId: "N5", latitude: 37.78832, longitude: -122.4058 },
          { nodeId: "N6", latitude: 37.79095, longitude: -122.3979 },
        ],
        uasTrack: [
          { latitude: 37.79115, longitude: -122.40365 },
          { latitude: 37.79085, longitude: -122.40285 },
          { latitude: 37.79055, longitude: -122.4019 },
          { latitude: 37.79025, longitude: -122.40095 },
          { latitude: 37.79, longitude: -122.4001 },
          { latitude: 37.7897, longitude: -122.3992 },
        ],
        controlSource: {
          label: "Probable UAS Control Source",
          latitude: 37.78928,
          longitude: -122.39795,
          radiusMeters: 115,
        },
        eventLabel: "UAS Track",
        latestEvent: "UAS track crossing northwest approach",
      },
    },
    {
      source: "mock",
      objectExportName: "CaskMission",
      objectApiName: "CaskMission",
      primaryKey: missionId ?? "mission-live-edge",
      title: "Altiair controlled training tag lane",
      observedAt: pulledAt,
      summary: "Mission context identifies the authorized training lane, approved sensors, policy state, and local-only continuity posture.",
      payloadJson: {
        missionId: missionId ?? "mission-live-edge",
        name: "Altiair controlled training tag lane",
        policyState: "authorized_to_share",
        authorizedZoneId: "training-zone-alpha",
        allowedSensors: ["rfid", "audio", "camera", "node_health"],
      },
    },
    {
      source: "mock",
      objectExportName: "CaskMissionInstruction",
      objectApiName: "CaskMissionInstruction",
      primaryKey: "instr-mission-live-edge-mock",
      title: "CASK deployment instruction",
      observedAt: pulledAt,
      summary: "Foundry mission context should seed local node leases before sensor replay begins.",
      payloadJson: {
        missionId: missionId ?? "mission-live-edge",
        subjectRef: "training-tag-001",
        authorizedZoneId: "training-zone-alpha",
        objectiveType: "controlled_training_tag",
      },
    },
    {
      source: "mock",
      objectExportName: "CaskPolicyDecision",
      objectApiName: "CaskPolicyDecision",
      primaryKey: "policy-instr-mission-live-edge-mock",
      title: "Policy gate",
      observedAt: pulledAt,
      summary: "Policy allows evidence collection, local fusion, gossip, display, queueing, and OSDK sync; it rejects harmful or autonomous actions.",
      payloadJson: {
        policyState: "authorized_to_share",
        deployable: true,
        rejectedActions: [
          "No engagement order.",
          "No autonomous action.",
          "No pursuit, capture, restraint, or harm.",
        ],
      },
    },
    {
      source: "mock",
      objectExportName: "CaskEdgeNode",
      objectApiName: "CaskEdgeNode",
      primaryKey: "altiair-hub",
      title: "Pi 5 hub and display",
      observedAt: pulledAt,
      summary: "Pi 5 is the preferred display, mission LAN host, queue owner, and Foundry gateway when connectivity exists.",
      payloadJson: {
        nodeId: "altiair-hub",
        platform: "raspberry_pi_5",
        roles: ["mission_lan_host", "mesh_hub", "operator_display", "foundry_gateway"],
      },
    },
    {
      source: "mock",
      objectExportName: "CaskOntologyShape",
      objectApiName: "CaskOntologyShape",
      primaryKey: "local-cask-shape",
      title: "Local CASK ontology shape",
      observedAt: pulledAt,
      summary: `Local runtime expects ${ontologyObjectNames.length} CASK object types and can queue records until Foundry resources catch up.`,
      payloadJson: {
        ontologyName: caskOntologyShape.ontologyName,
        objectTypes: ontologyObjectNames,
        actionTypes: caskOntologyShape.actionTypes.map((actionType) => actionType.apiName),
      },
    },
  ];
}

function recordFromFoundryObject(
  objectExportName: string,
  objectApiName: string,
  primaryKeyApiName: string | undefined,
  payloadJson: Record<string, unknown>,
): FoundryIntelligenceRecord {
  const primaryKey = primaryKeyApiName === undefined
    ? stringValue(payloadJson.$primaryKey) ?? stringValue(payloadJson.id) ?? stringValue(payloadJson.rid)
    : stringValue(payloadJson[primaryKeyApiName]);
  const title = stringValue(payloadJson.name) ??
    stringValue(payloadJson.title) ??
    stringValue(payloadJson.displayName) ??
    primaryKey;
  const observedAt = stringValue(payloadJson.timestamp) ??
    stringValue(payloadJson.observedAt) ??
    stringValue(payloadJson.createdAt) ??
    stringValue(payloadJson.updatedAt);

  return {
    source: "osdk",
    objectExportName,
    objectApiName,
    primaryKey,
    title,
    observedAt,
    summary: summarizeObject(objectApiName, payloadJson, primaryKey),
    payloadJson,
  };
}

function summarizeObject(
  objectApiName: string,
  payloadJson: Record<string, unknown>,
  primaryKey: string | undefined,
): string {
  if (objectApiName === "ExampleCaskGpsPosition") {
    const deviceId = stringValue(payloadJson.deviceId) ?? "unknown device";
    const latitude = numberValue(payloadJson.latitude);
    const longitude = numberValue(payloadJson.longitude);
    const coord = latitude === undefined || longitude === undefined
      ? "without coordinates"
      : `at ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    return `Foundry GPS-position object for ${deviceId} ${coord}.`;
  }
  return `Foundry ${objectApiName} object${primaryKey === undefined ? "" : ` ${primaryKey}`} retrieved through OSDK.`;
}

function buildBrief(records: FoundryIntelligenceRecord[], mode: "mock" | "osdk"): string[] {
  const byObject = new Map<string, number>();
  for (const record of records) {
    byObject.set(record.objectApiName, (byObject.get(record.objectApiName) ?? 0) + 1);
  }
  const counts = [...byObject.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([objectApiName, count]) => `${count} ${objectApiName}`)
    .join(", ");
  return [
    mode === "osdk"
      ? "Direct Foundry OSDK intelligence pull completed."
      : "Mock Foundry intelligence pull returned the same local CASK shape used by the OSDK path.",
    counts.length > 0 ? `Retrieved context: ${counts}.` : "No Foundry objects returned yet.",
    "Use retrieved objects as governed context for the local LLM, coordinator prompt, node leases, and evidence citations.",
    "Foundry is optional at runtime: the edge LLM and gossip path continue decentralized work when disconnected.",
  ];
}

function recommendedUses(): string[] {
  return [
    "Pull governed mission, zone, policy, and tag context only when a gateway has Foundry connectivity.",
    "Cache retrieved context locally so the Pi/Jetson mesh continues decentralized operation in DDIL.",
    "Resolve RFID tag IDs to governed training subject, asset, or object references when connected.",
    "Attach Foundry object IDs to local LLM evidence citations and commander-facing after-action records.",
    "Queue what happened back to Foundry/CASK for commander visibility when policy and connectivity allow it.",
  ];
}

function clampPageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 25;
  }
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

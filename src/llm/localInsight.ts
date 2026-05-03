import type { LocalLlmConfig } from "../config.js";
import { assertAllowedLocalModel } from "../config.js";
import type { CaskBundle, InsightDraft } from "../cask/types.js";
import type { CaskLlmContextPack } from "./caskContext.js";

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

export interface LocalInsightClient {
  draftInsight(bundle: CaskBundle, context?: CaskLlmContextPack): Promise<InsightDraft>;
}

export function createLocalInsightClient(config: LocalLlmConfig): LocalInsightClient {
  assertAllowedLocalModel(config.model);
  if (config.mode === "mock") {
    return new DeterministicInsightClient(config.model);
  }
  return new OllamaInsightClient(config);
}

class DeterministicInsightClient implements LocalInsightClient {
  constructor(private readonly model: string) {}

  async draftInsight(bundle: CaskBundle, context?: CaskLlmContextPack): Promise<InsightDraft> {
    return buildFallbackInsight(bundle, this.model, context);
  }
}

class OllamaInsightClient implements LocalInsightClient {
  constructor(private readonly config: LocalLlmConfig) {}

  async draftInsight(bundle: CaskBundle, context?: CaskLlmContextPack): Promise<InsightDraft> {
    const prompt = [
      "You are the local CASK edge insight drafter.",
      "Return only strict JSON for an InsightDraft.",
      "Use evidence IDs from the bundle. Mention uncertainty and policy state.",
      "Use the CASK context pack for Foundry/ontology object names and connected-vs-DDIL status.",
      "Allowed recommendations are verification, sensor repositioning, coverage, deconfliction, and human review.",
      "Do not recommend target prosecution, engagement, capture, harm, or autonomous action.",
      "Schema keys: id, bundleId, model, createdAt, summary, confidence, limitations, evidenceIds, recommendedNextChecks, policyState.",
      context === undefined ? "CASK context pack: none" : `CASK context pack JSON: ${JSON.stringify(context)}`,
      `Bundle JSON: ${JSON.stringify(bundle)}`,
    ].join("\n");

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        format: "json",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Local LLM request failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const content = body.message?.content;
    if (content === undefined) {
      throw new Error("Local LLM response did not include message.content.");
    }

    return normalizeInsight(JSON.parse(content) as Partial<InsightDraft>, bundle, this.config.model, context);
  }
}

function buildFallbackInsight(
  bundle: CaskBundle,
  model: string,
  context?: CaskLlmContextPack,
): InsightDraft {
  const evidenceIds = [
    ...bundle.sensorEvents.map((event) => event.id),
    ...bundle.locationFixes.map((fix) => fix.id),
    ...bundle.droneObservations.map((observation) => observation.id),
    ...bundle.controlSourceEstimates.map((estimate) => estimate.id),
    ...bundle.counterUasCues.map((cue) => cue.id),
  ];

  const cue = bundle.counterUasCues[0];
  const policyState = cue?.policyGate ?? "review_needed";
  const confidence = cue?.confidence ?? 0.5;

  return {
    id: `insight-${bundle.id}`,
    bundleId: bundle.id,
    model,
    createdAt: new Date().toISOString(),
    summary:
      "Local edge fusion produced a policy-gated cue that no single node can resolve alone: RFID, audio, Jetson visual inference, and cached mission context are all required. The cue should remain in human review until corroborated.",
    confidence,
    limitations: [
      "Arduino RFID location is live RFID-derived provider-style telemetry and is coarse by design.",
      ...(context?.evidence.providerProfiles.includes("l3harris_tactical_lte_mock")
        ? ["The L3Harris-style LTE feed is simulated from RFID/Wi-Fi proximity, not a live carrier or vendor integration."]
        : []),
      ...(context === undefined
        ? ["No CASK context pack is attached; the LLM is using local bundle records only."]
        : context.foundry.mode === "none"
          ? ["No Foundry intelligence snapshot is attached; the LLM is using local CASK records only."]
          : [`Foundry/CASK context is ${context.foundry.connected ? "connected" : "cached or mocked"} with ${context.foundry.recordCount} context records.`]),
      "Each node's local readout is intentionally below the resolution threshold without cross-node fusion.",
      "Camera and microphone observations require corroboration before sharing outside the local mesh.",
      "Foundry writeback may be queued when the CASK/Foundry uplink is unavailable.",
    ],
    evidenceIds,
    recommendedNextChecks: [
      "Confirm the cue with a second sensor or operator report.",
      "Check freshness on RFID and provider-style location before escalation.",
      "Use CASK ontology IDs and Foundry context records for citations when syncing to the commander view.",
      "Keep the policy gate visible on the Pi-hosted display.",
    ],
    policyState,
  };
}

function normalizeInsight(
  draft: Partial<InsightDraft>,
  bundle: CaskBundle,
  model: string,
  context?: CaskLlmContextPack,
): InsightDraft {
  const fallback = buildFallbackInsight(bundle, model, context);

  return {
    id: typeof draft.id === "string" ? draft.id : fallback.id,
    bundleId: bundle.id,
    model,
    createdAt: typeof draft.createdAt === "string" ? draft.createdAt : fallback.createdAt,
    summary: typeof draft.summary === "string" ? draft.summary : fallback.summary,
    confidence: typeof draft.confidence === "number" ? clamp01(draft.confidence) : fallback.confidence,
    limitations: stringArrayOr(draft.limitations, fallback.limitations),
    evidenceIds: stringArrayOr(draft.evidenceIds, fallback.evidenceIds),
    recommendedNextChecks: stringArrayOr(
      draft.recommendedNextChecks,
      fallback.recommendedNextChecks,
    ),
    policyState: draft.policyState ?? fallback.policyState,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

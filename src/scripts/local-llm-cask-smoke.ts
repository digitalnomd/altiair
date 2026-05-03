import { loadConfig } from "../config.js";
import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildCaskLlmContextPack } from "../llm/caskContext.js";
import { createFoundryIntelligenceClient } from "../foundry/intelligence.js";
import { createLocalInsightClient } from "../llm/localInsight.js";

const config = loadConfig();
const bundle = buildSampleBundle(new Date("2026-05-03T07:15:00.000Z"));
const foundryIntelligence = await createFoundryIntelligenceClient(config.foundry).getMissionIntelligence({
  missionId: bundle.missionId,
  pageSize: 5,
});
const context = buildCaskLlmContextPack(bundle, foundryIntelligence);
const insight = await createLocalInsightClient(config.llm).draftInsight(bundle, context);

if (context.demoMode !== "mock_sensors_live_network") {
  throw new Error("Expected sample demo context to mark sensors as mocked while preserving live-network intent.");
}
if (context.ontology.objectTypes.length === 0 || context.ontology.actionTypes.length === 0) {
  throw new Error("Expected CASK ontology object/action names in the local LLM context pack.");
}
if (context.foundry.recordCount === 0) {
  throw new Error("Expected Foundry intelligence context records in mock or OSDK mode.");
}
if (!context.evidence.providerProfiles.includes("l3harris_tactical_lte_mock")) {
  throw new Error("Expected local LLM context to include the L3Harris-style tactical LTE mock profile.");
}
if (!insight.evidenceIds.includes("provider-style-loc-demo-001")) {
  throw new Error("Expected local insight to cite provider-style location evidence.");
}

console.log(JSON.stringify({
  smoke: "passed",
  llmMode: config.llm.mode,
  model: config.llm.model,
  context: {
    schemaVersion: context.schemaVersion,
    demoMode: context.demoMode,
    ontologyObjectCount: context.ontology.objectTypes.length,
    ontologyActionCount: context.ontology.actionTypes.length,
    foundryMode: context.foundry.mode,
    foundryConnected: context.foundry.connected,
    foundryRecordCount: context.foundry.recordCount,
    providerProfiles: context.evidence.providerProfiles,
  },
  insight: {
    id: insight.id,
    confidence: insight.confidence,
    policyState: insight.policyState,
    evidenceIds: insight.evidenceIds,
  },
}, null, 2));

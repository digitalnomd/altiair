import { loadConfig } from "../config.js";
import { buildSampleBundle } from "../cask/sampleBundle.js";
import { buildCaskLlmContextPack } from "../llm/caskContext.js";
import { createFoundryIntelligenceClient } from "../foundry/intelligence.js";
import { createFoundryUploader } from "../foundry/uploader.js";
import { createLocalInsightClient } from "../llm/localInsight.js";

const args = new Set(process.argv.slice(2));
const config = loadConfig();

if (args.has("--foundry")) {
  config.foundry.mode = "osdk";
}

const bundle = buildSampleBundle();
const intelligenceClient = createFoundryIntelligenceClient(config.foundry);
const insightClient = createLocalInsightClient(config.llm);
const uploader = createFoundryUploader(config.foundry);

const foundryIntelligence = await intelligenceClient.getMissionIntelligence({
  missionId: bundle.missionId,
  pageSize: 5,
});
const caskContext = buildCaskLlmContextPack(bundle, foundryIntelligence);
const insight = await insightClient.draftInsight(bundle, caskContext);
const ack = await uploader.uploadBundle(bundle, insight);

console.log(
  JSON.stringify(
    {
      bundleId: bundle.id,
      foundryMode: config.foundry.mode,
      llmMode: config.llm.mode,
      caskContext: {
        schemaVersion: caskContext.schemaVersion,
        demoMode: caskContext.demoMode,
        ontologyObjectCount: caskContext.ontology.objectTypes.length,
        ontologyActionCount: caskContext.ontology.actionTypes.length,
        foundryMode: caskContext.foundry.mode,
        foundryRecordCount: caskContext.foundry.recordCount,
        providerProfiles: caskContext.evidence.providerProfiles,
      },
      insight,
      ack,
    },
    null,
    2,
  ),
);

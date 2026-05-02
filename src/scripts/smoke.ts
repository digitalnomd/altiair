import { loadConfig } from "../config.js";
import { buildSampleBundle } from "../cask/sampleBundle.js";
import { createFoundryUploader } from "../foundry/uploader.js";
import { createLocalInsightClient } from "../llm/localInsight.js";

const args = new Set(process.argv.slice(2));
const config = loadConfig();

if (args.has("--foundry")) {
  config.foundry.mode = "osdk";
}

const bundle = buildSampleBundle();
const insightClient = createLocalInsightClient(config.llm);
const uploader = createFoundryUploader(config.foundry);

const insight = await insightClient.draftInsight(bundle);
const ack = await uploader.uploadBundle(bundle, insight);

console.log(
  JSON.stringify(
    {
      bundleId: bundle.id,
      foundryMode: config.foundry.mode,
      llmMode: config.llm.mode,
      insight,
      ack,
    },
    null,
    2,
  ),
);

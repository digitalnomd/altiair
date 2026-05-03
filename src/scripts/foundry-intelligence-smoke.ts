import { loadConfig } from "../config.js";
import { createFoundryIntelligenceClient } from "../foundry/intelligence.js";

const config = loadConfig();
const client = createFoundryIntelligenceClient(config.foundry);
const snapshot = await client.getMissionIntelligence({
  missionId: "mission-live-edge",
  pageSize: 5,
});

if (snapshot.records.length === 0) {
  throw new Error("Expected at least one Foundry intelligence record in smoke mode.");
}
if (!snapshot.recommendedLocalUses.some((item) => item.includes("when a gateway has Foundry connectivity"))) {
  throw new Error("Expected Foundry intelligence to be framed as connected-gateway-only.");
}

console.log(JSON.stringify({
  mode: snapshot.mode,
  connected: snapshot.connected,
  recordCount: snapshot.records.length,
  generatedObjectExports: snapshot.generatedObjectExports,
  firstBrief: snapshot.intelligenceBrief[0],
  recommendedLocalUses: snapshot.recommendedLocalUses,
}, null, 2));

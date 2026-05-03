import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { assertAllowedLocalModel } from "../config.js";
import {
  buildDeploymentOrder,
  buildMissionInstruction,
  sampleMissionInstructionInput,
} from "../cask/missionDeployment.js";
import { defaultDdilMeshTopology, nominalMeshObservations } from "../mesh/defaultTopology.js";

interface SecretScanRule {
  name: string;
  pattern: RegExp;
}

interface SecretFinding {
  rule: string;
  file: string;
  line: number;
}

const createdAt = new Date("2026-05-03T06:30:00.000Z");
const allowedModel = "gemma4:e2b";
const bannedModels = [
  "qwen2.5:0.5b",
  "deepseek-r1:1.5b",
  "yi:6b",
  "minicpm-v:8b",
  "baichuan2:7b",
  "chatglm3:6b",
  "internlm2:7b",
];

assertAllowedLocalModel(allowedModel);
for (const model of bannedModels) {
  assertThrows(() => assertAllowedLocalModel(model), `Expected ${model} to be blocked.`);
}

const safeInstruction = buildMissionInstruction(sampleMissionInstructionInput(), { createdAt });
const safeDeployment = buildDeploymentOrder(
  safeInstruction,
  defaultDdilMeshTopology,
  nominalMeshObservations,
  { createdAt, deploy: true },
);

assert(safeInstruction.policyState === "authorized_to_share", "Expected safe instruction to pass policy.");
assert(safeDeployment.state === "deployed", "Expected safe deployment to be active.");
assert(safeDeployment.nodeLeases.length > 0, "Expected safe deployment to assign node leases.");

const unsafeInstruction = buildMissionInstruction({
  missionText: "Find the enemy target and take out the operator.",
  operatorAuthorized: true,
}, { createdAt });
const unsafeDeployment = buildDeploymentOrder(
  unsafeInstruction,
  defaultDdilMeshTopology,
  nominalMeshObservations,
  { createdAt, deploy: true },
);

assert(unsafeInstruction.policyState === "blocked", "Expected unsafe instruction to be blocked.");
assert(unsafeDeployment.state === "blocked", "Expected unsafe deployment to be blocked.");
assert(unsafeDeployment.nodeLeases.length === 0, "Blocked deployment must not assign leases.");

const secretFindings = scanTrackedFilesForSecrets();
assert(
  secretFindings.length === 0,
  `Secret-like literals found:\n${secretFindings
    .map((finding) => `${finding.file}:${finding.line} ${finding.rule}`)
    .join("\n")}`,
);

console.log(JSON.stringify({
  secureCodingSmoke: "passed",
  allowedModel,
  blockedModelFamilies: bannedModels,
  policyGate: {
    safeState: safeDeployment.state,
    safeLeaseCount: safeDeployment.nodeLeases.length,
    unsafeState: unsafeDeployment.state,
    unsafeBlockedReasons: unsafeInstruction.policyDecision.blockedReasons,
  },
  secretScan: {
    trackedFilesScanned: trackedFiles().length,
    findings: secretFindings.length,
  },
}, null, 2));

function scanTrackedFilesForSecrets(): SecretFinding[] {
  const rules: SecretScanRule[] = [
    {
      name: "private-key-material",
      pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    },
    {
      name: "literal-env-secret",
      pattern: /\b(?:FOUNDRY_CLIENT_SECRET|ALTIAIR_API_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN|PALANTIR_TOKEN|FOUNDRY_TOKEN)\s*=\s*(?!<|\$\{|REPLACE_|your-|example|mock|test)[^\s"'#]+/g,
    },
    {
      name: "literal-npm-auth-token",
      pattern: /_authToken\s*=\s*(?!\$\{|<|REPLACE_|your-|example|mock|test)[^\s"'#]+/g,
    },
    {
      name: "literal-json-secret",
      pattern: /"(?:client_secret|access_token|refresh_token|private_key)"\s*:\s*"(?!<|REPLACE_|your-|example|mock|test)[^"]{12,}"/gi,
    },
    {
      name: "private-foundry-url",
      pattern: /https:\/\/(?!<your-foundry-stack>)[A-Za-z0-9.-]+\.palantirfoundry\.com/g,
    },
  ];

  const findings: SecretFinding[] = [];
  for (const file of trackedFiles()) {
    const absolute = path.join(process.cwd(), file);
    if (!existsSync(absolute)) {
      continue;
    }
    const buffer = readFileSync(absolute);
    if (buffer.includes(0)) {
      continue;
    }
    const text = buffer.toString("utf8");
    for (const rule of rules) {
      for (const match of text.matchAll(rule.pattern)) {
        const index = match.index ?? 0;
        findings.push({
          rule: rule.name,
          file,
          line: text.slice(0, index).split("\n").length,
        });
      }
    }
  }
  return findings;
}

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: process.cwd() })
    .toString("utf8")
    .split("\0")
    .filter((file) => file.length > 0 && !file.startsWith("node_modules/"));
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

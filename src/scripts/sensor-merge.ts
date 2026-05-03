import { readFile } from "node:fs/promises";
import { buildCaskBundleFromLiveInputs, type LiveSensorInput } from "../sensors/liveMerge.js";
import { jsonRequestBody } from "./encryptedJson.js";

const inputPath = argValue("--input");
const postUrl = argValue("--post-url") ?? process.env.ALTIAIR_SENSOR_POST_URL;
const missionId = argValue("--mission") ?? process.env.ALTIAIR_MISSION_ID;
const sourceNodeId = argValue("--source-node") ?? process.env.ALTIAIR_NODE_ID;

const rawInput = inputPath === undefined ? await readStdin() : await readFile(inputPath, "utf8");
const inputs = parseSensorInputs(rawInput);
const bundle = buildCaskBundleFromLiveInputs(inputs, {
  missionId,
  sourceNodeId,
});

if (postUrl !== undefined) {
  const body = postUrl.endsWith("/sensor-events") ? { events: inputs } : bundle;
  const response = await fetch(postUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authorizationHeader(),
    },
    body: jsonRequestBody(postUrl, body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${postUrl} failed with HTTP ${response.status}: ${text}`);
  }
  console.log(text);
} else {
  console.log(JSON.stringify(bundle, null, 2));
}

function parseSensorInputs(rawInput: string): LiveSensorInput[] {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    throw new Error("No sensor input was provided on stdin or --input.");
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as LiveSensorInput[];
    }
    if (isRecord(parsed) && Array.isArray(parsed.events)) {
      return parsed.events as LiveSensorInput[];
    }
    return [parsed as LiveSensorInput];
  }

  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LiveSensorInput);
}

function authorizationHeader(): Record<string, string> {
  const token = process.env.ALTIAIR_API_TOKEN;
  if (token === undefined || token.trim() === "") {
    return {};
  }
  return {
    authorization: `Bearer ${token}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

import { buildCaskBundleFromLiveInputs } from "../sensors/liveMerge.js";
import {
  buildCaskDemoMockScenario,
  latestMockScenarioEvents,
  type MockScenario,
} from "../mock/caskDemoScenario.js";
import { jsonRequestBody } from "./encryptedJson.js";

type OutputFormat = "steps" | "latest-events" | "bundle" | "summary";

const postUrl = argValue("--post-url") ?? process.env.ALTIAIR_SENSOR_POST_URL;
const replay = hasFlag("--replay") || postUrl !== undefined;
const delayMs = numberArg("--delay-ms", replay ? 250 : 0);
const missionId = argValue("--mission") ?? process.env.ALTIAIR_MISSION_ID ?? "mission-live-edge";
const liveClock = hasFlag("--live-clock");
const startAt = liveClock ? new Date() : dateArg("--start-at") ?? undefined;
const format = outputFormat(argValue("--format") ?? (replay ? "summary" : "steps"));
const includePi5Hub = hasFlag("--include-pi5");
const includeFailureStep = hasFlag("--include-failure-step");
const loop = hasFlag("--loop");
const cycles = integerArg("--cycles", loop ? Number.POSITIVE_INFINITY : 1);

const scenario = buildCaskDemoMockScenario({
  missionId,
  startAt,
  includePi5Hub,
  includeFailureStep,
});

if (replay) {
  if (postUrl === undefined) {
    throw new Error("--replay requires --post-url or ALTIAIR_SENSOR_POST_URL.");
  }
  await replayScenario(postUrl, delayMs);
} else {
  printScenario(scenario, format);
}

async function replayScenario(url: string, delayMs: number): Promise<void> {
  let cycle = 0;
  while (cycle < cycles) {
    const cycleScenario = buildCaskDemoMockScenario({
      missionId,
      startAt: liveClock ? new Date() : startAt,
      includePi5Hub,
      includeFailureStep,
    });
    const summaries: unknown[] = [];
    for (const [index, step] of cycleScenario.steps.entries()) {
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      const requestBody = {
        scenarioId: cycleScenario.id,
        stepId: step.id,
        cycle,
        missionId: cycleScenario.missionId,
        sourceNodeId: "altiair-orin",
        bundleId: `bundle-${cycleScenario.missionId}-${step.id}-${cycle}`,
        createdAt: latestObservedAt(step.events) ?? cycleScenario.generatedAt,
        events: step.events,
      };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authorizationHeader(),
        },
        body: jsonRequestBody(url, requestBody),
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(`POST ${url} failed at ${step.id} with HTTP ${response.status}: ${bodyText}`);
      }
      const responseBody = JSON.parse(bodyText) as Record<string, unknown>;
      summaries.push({
        cycle,
        stepId: step.id,
        title: step.title,
        status: response.status,
        bundleId: responseBody.bundleId,
        accepted: responseBody.accepted,
        tagPlan: responseBody.tagPlan,
        localInstructionCount: localInstructionCount(responseBody.localInstructions),
        localLlm: responseBody.localLlm,
      });
    }

    console.log(JSON.stringify({
      replayed: true,
      postUrl: url,
      scenarioId: cycleScenario.id,
      stepCount: cycleScenario.steps.length,
      cycle,
      includePi5Hub,
      includeFailureStep,
      summaries,
    }, null, 2));

    cycle += 1;
    if (cycle < cycles && delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

function printScenario(scenario: MockScenario, format: OutputFormat): void {
  if (format === "steps") {
    console.log(JSON.stringify(scenario, null, 2));
    return;
  }

  if (format === "latest-events") {
    console.log(JSON.stringify({
      scenarioId: scenario.id,
      stepId: scenario.steps[scenario.steps.length - 1]?.id,
      events: latestMockScenarioEvents({
        missionId: scenario.missionId,
        startAt: new Date(scenario.generatedAt),
      }),
    }, null, 2));
    return;
  }

  if (format === "bundle") {
    const latest = scenario.steps[scenario.steps.length - 1];
    const bundle = buildCaskBundleFromLiveInputs(latest?.events ?? [], {
      missionId: scenario.missionId,
      sourceNodeId: "altiair-hub",
      createdAt: new Date(scenario.generatedAt),
    });
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }

  console.log(JSON.stringify({
    scenarioId: scenario.id,
    name: scenario.name,
    missionId: scenario.missionId,
    zoneId: scenario.zoneId,
    subjectTagId: scenario.subjectTagId,
    stepCount: scenario.steps.length,
    steps: scenario.steps.map((step) => ({
      id: step.id,
      title: step.title,
      eventCount: step.events.length,
      expectedRuntimeProducts: step.expectedRuntimeProducts,
    })),
  }, null, 2));
}

function localInstructionCount(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value.localAssignments)) {
    return 0;
  }
  return value.localAssignments.length;
}

function latestObservedAt(events: Array<{ observedAt?: string }>): string | undefined {
  const timestamps = events
    .map((event) => event.observedAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length === 0) {
    return undefined;
  }
  return new Date(Math.max(...timestamps)).toISOString();
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

function outputFormat(value: string): OutputFormat {
  if (value === "steps" || value === "latest-events" || value === "bundle" || value === "summary") {
    return value;
  }
  throw new Error(`Unsupported --format ${value}. Use steps, latest-events, bundle, or summary.`);
}

function dateArg(name: string): Date | undefined {
  const value = argValue(name);
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
  return date;
}

function numberArg(name: string, fallback: number): number {
  const value = argValue(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function integerArg(name: string, fallback: number): number {
  const value = argValue(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

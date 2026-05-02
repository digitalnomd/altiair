export type FoundryMode = "mock" | "osdk";
export type LocalLlmMode = "mock" | "ollama";
export type FoundryActionPayloadStyle = "json" | "raw";

export interface FoundryActionMap {
  createSensorObservation: string;
  createLocationFix: string;
  createCounterUasCue: string;
  createInsightDraft: string;
  upsertNodeHealth: string;
}

export interface FoundryConfig {
  mode: FoundryMode;
  foundryUrl?: string;
  ontologyRid?: string;
  clientId?: string;
  clientSecret?: string;
  osdkPackage?: string;
  actionPayloadStyle: FoundryActionPayloadStyle;
  actions: FoundryActionMap;
}

export interface RequiredFoundryConfig extends FoundryConfig {
  mode: "osdk";
  foundryUrl: string;
  ontologyRid: string;
  clientId: string;
  clientSecret: string;
  osdkPackage: string;
}

export interface LocalLlmConfig {
  mode: LocalLlmMode;
  baseUrl: string;
  model: string;
}

export interface AppConfig {
  foundry: FoundryConfig;
  llm: LocalLlmConfig;
}

const bannedModelPatterns = [
  /qwen/i,
  /deepseek/i,
  /(^|[-_/])yi([:-]|$)/i,
  /minicpm/i,
  /baichuan/i,
  /chatglm/i,
  /internlm/i,
];

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function parseFoundryMode(value: string | undefined): FoundryMode {
  if (value === undefined || value === "mock") {
    return "mock";
  }
  if (value === "osdk") {
    return "osdk";
  }
  throw new Error(`FOUNDRY_MODE must be "mock" or "osdk"; received "${value}".`);
}

function parseLocalLlmMode(value: string | undefined): LocalLlmMode {
  if (value === undefined || value === "mock") {
    return "mock";
  }
  if (value === "ollama") {
    return "ollama";
  }
  throw new Error(`LOCAL_LLM_MODE must be "mock" or "ollama"; received "${value}".`);
}

function parsePayloadStyle(value: string | undefined): FoundryActionPayloadStyle {
  if (value === undefined || value === "json") {
    return "json";
  }
  if (value === "raw") {
    return "raw";
  }
  throw new Error(`FOUNDRY_ACTION_PAYLOAD_STYLE must be "json" or "raw"; received "${value}".`);
}

export function assertAllowedLocalModel(model: string): void {
  const blockedBy = bannedModelPatterns.find((pattern) => pattern.test(model));
  if (blockedBy) {
    throw new Error(
      `Blocked local model "${model}" by project policy. Do not use Qwen, DeepSeek, Yi, MiniCPM, Baichuan, ChatGLM, InternLM, or derivatives.`,
    );
  }
}

export function loadConfig(): AppConfig {
  const llmModel = env("LOCAL_LLM_MODEL", "gemma3:1b")!;
  assertAllowedLocalModel(llmModel);

  return {
    foundry: {
      mode: parseFoundryMode(env("FOUNDRY_MODE")),
      foundryUrl: env("FOUNDRY_API_URL"),
      ontologyRid: env("FOUNDRY_ONTOLOGY_RID"),
      clientId: env("FOUNDRY_CLIENT_ID"),
      clientSecret: env("FOUNDRY_CLIENT_SECRET"),
      osdkPackage: env("FOUNDRY_OSDK_PACKAGE"),
      actionPayloadStyle: parsePayloadStyle(env("FOUNDRY_ACTION_PAYLOAD_STYLE")),
      actions: {
        createSensorObservation: env(
          "FOUNDRY_ACTION_CREATE_SENSOR_OBSERVATION",
          "createSensorObservation",
        )!,
        createLocationFix: env("FOUNDRY_ACTION_CREATE_LOCATION_FIX", "createLocationFix")!,
        createCounterUasCue: env(
          "FOUNDRY_ACTION_CREATE_COUNTER_UAS_CUE",
          "createCounterUasCue",
        )!,
        createInsightDraft: env("FOUNDRY_ACTION_CREATE_INSIGHT_DRAFT", "createInsightDraft")!,
        upsertNodeHealth: env("FOUNDRY_ACTION_UPSERT_NODE_HEALTH", "upsertNodeHealth")!,
      },
    },
    llm: {
      mode: parseLocalLlmMode(env("LOCAL_LLM_MODE")),
      baseUrl: env("LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434")!,
      model: llmModel,
    },
  };
}

export function requireFoundryConfig(config: FoundryConfig): RequiredFoundryConfig {
  if (config.mode !== "osdk") {
    throw new Error("Foundry OSDK config was requested while FOUNDRY_MODE is not osdk.");
  }

  const missing = [
    ["FOUNDRY_API_URL", config.foundryUrl],
    ["FOUNDRY_ONTOLOGY_RID", config.ontologyRid],
    ["FOUNDRY_CLIENT_ID", config.clientId],
    ["FOUNDRY_CLIENT_SECRET", config.clientSecret],
    ["FOUNDRY_OSDK_PACKAGE", config.osdkPackage],
  ].filter(([, value]) => value === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing required Foundry OSDK env vars: ${missing.map(([name]) => name).join(", ")}`);
  }

  return config as RequiredFoundryConfig;
}

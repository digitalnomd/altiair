import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";
import type { RequiredFoundryConfig } from "../config.js";

export interface FoundryOsdkRuntime {
  client: ReturnType<typeof createClient>;
  generated: Record<string, unknown>;
  applyAction: (actionExportName: string, payload: Record<string, unknown>) => Promise<unknown>;
  fetchObjects: (
    objectExportName: string,
    options?: { pageSize?: number; nextPageToken?: string },
  ) => Promise<FoundryObjectPage>;
  generatedObjectExportNames: () => string[];
  generatedActionExportNames: () => string[];
}

export interface FoundryObjectPage {
  exportName: string;
  objectApiName: string;
  primaryKeyApiName?: string;
  data: Record<string, unknown>[];
  nextPageToken?: string;
  totalCount?: string;
}

export async function createFoundryOsdkRuntime(
  config: RequiredFoundryConfig,
): Promise<FoundryOsdkRuntime> {
  const auth = createConfidentialOauthClient(
    config.clientId,
    config.clientSecret,
    config.foundryUrl,
  );
  const client = createClient(config.foundryUrl, config.ontologyRid, auth);
  const generated = (await import(config.osdkPackage)) as Record<string, unknown>;

  return {
    client,
    generated,
    async applyAction(actionExportName, payload) {
      const { exportName, action } = resolveGeneratedActionExport(generated, actionExportName);
      if (action === undefined) {
        throw new Error("Internal error: generated action resolution returned undefined.");
      }

      const actionClient = (client as unknown as (actionDefinition: unknown) => {
        applyAction: (
          payload: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) => Promise<unknown>;
      })(action);

      try {
        return await actionClient.applyAction(payload, { $returnEdits: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Foundry action "${exportName}" failed: ${message}`);
      }
    },
    async fetchObjects(objectExportName, options = {}) {
      const { exportName, object } = resolveGeneratedObjectExport(generated, objectExportName);
      const objectSet = (client as unknown as (objectDefinition: unknown) => {
        fetchPage: (args?: Record<string, unknown>) => Promise<{
          data: unknown[];
          nextPageToken?: string;
          totalCount?: string;
        }>;
      })(object);
      const page = await objectSet.fetchPage({
        $pageSize: options.pageSize ?? 25,
        ...(options.nextPageToken === undefined ? {} : { $nextPageToken: options.nextPageToken }),
      });
      return {
        exportName,
        objectApiName: objectApiName(object),
        primaryKeyApiName: primaryKeyApiName(object),
        data: page.data.map(toPlainObject),
        nextPageToken: page.nextPageToken,
        totalCount: page.totalCount,
      };
    },
    generatedObjectExportNames() {
      return exportedDefinitions(generated, "object");
    },
    generatedActionExportNames() {
      return exportedDefinitions(generated, "action");
    },
  };
}

function resolveGeneratedActionExport(
  generated: Record<string, unknown>,
  requestedName: string,
): { exportName: string; action: unknown } {
  const candidates = unique([
    requestedName,
    toCamelCase(requestedName),
    toCamelCase(requestedName.replace(/^\[Example\]\s*/i, "")),
    toCamelCase(requestedName.replace(/^create[-_\s]+/i, "create ")),
  ]);

  for (const candidate of candidates) {
    if (candidate in generated) {
      return {
        exportName: candidate,
        action: generated[candidate],
      };
    }
  }

  const available = Object.keys(generated)
    .filter((key) => !key.startsWith("$") && !key.startsWith("_"))
    .sort()
    .slice(0, 40);

  throw new Error(
    [
      `Generated OSDK package does not export action "${requestedName}".`,
      `Tried: ${candidates.join(", ")}.`,
      available.length > 0
        ? `Available exports include: ${available.join(", ")}.`
        : "The generated package did not expose enumerable exports.",
      "Override the FOUNDRY_ACTION_* environment variable or add the action to the Developer Console app.",
    ].join(" "),
  );
}

function resolveGeneratedObjectExport(
  generated: Record<string, unknown>,
  requestedName: string,
): { exportName: string; object: unknown } {
  const candidates = unique([
    requestedName,
    requestedName.replace(/^\[Example\]\s*/i, "Example"),
    toPascalCase(requestedName),
    toPascalCase(requestedName.replace(/^\[Example\]\s*/i, "Example ")),
  ]);

  for (const candidate of candidates) {
    const value = generated[candidate];
    if (isDefinitionKind(value, "object")) {
      return {
        exportName: candidate,
        object: value,
      };
    }
  }

  const available = exportedDefinitions(generated, "object").slice(0, 40);
  throw new Error(
    [
      `Generated OSDK package does not export object "${requestedName}".`,
      `Tried: ${candidates.join(", ")}.`,
      available.length > 0
        ? `Available object exports include: ${available.join(", ")}.`
        : "The generated package did not expose object exports.",
      "Add the object type to the Developer Console app resources, regenerate the OSDK package, or update FOUNDRY_INTEL_OBJECT_EXPORTS.",
    ].join(" "),
  );
}

function toCamelCase(value: string): string {
  const words = value.match(/[A-Za-z0-9]+/g) ?? [];
  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0 ? normalized : `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
    })
    .join("");
}

function toPascalCase(value: string): string {
  const camel = toCamelCase(value);
  return `${camel[0]?.toUpperCase() ?? ""}${camel.slice(1)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function exportedDefinitions(generated: Record<string, unknown>, kind: "object" | "action"): string[] {
  return Object.entries(generated)
    .filter(([, value]) => isDefinitionKind(value, kind))
    .map(([key]) => key)
    .sort();
}

function isDefinitionKind(value: unknown, kind: "object" | "action"): boolean {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === kind;
}

function objectApiName(object: unknown): string {
  const value = object as { apiName?: unknown; __DefinitionMetadata?: { apiName?: unknown } };
  return typeof value.apiName === "string"
    ? value.apiName
    : typeof value.__DefinitionMetadata?.apiName === "string"
      ? value.__DefinitionMetadata.apiName
      : "unknown";
}

function primaryKeyApiName(object: unknown): string | undefined {
  const value = object as {
    primaryKeyApiName?: unknown;
    __DefinitionMetadata?: { primaryKeyApiName?: unknown };
  };
  return typeof value.primaryKeyApiName === "string"
    ? value.primaryKeyApiName
    : typeof value.__DefinitionMetadata?.primaryKeyApiName === "string"
      ? value.__DefinitionMetadata.primaryKeyApiName
      : undefined;
}

function toPlainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return { value };
  }
  const record = value as Record<string | symbol, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key === "symbol") {
      continue;
    }
    const item = record[key];
    if (typeof item !== "function") {
      output[key] = serializeValue(item);
    }
  }
  return output;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (typeof value === "object" && value !== null) {
    return toPlainObject(value);
  }
  return value;
}

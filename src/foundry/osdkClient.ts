import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";
import type { RequiredFoundryConfig } from "../config.js";

export interface FoundryOsdkRuntime {
  client: ReturnType<typeof createClient>;
  generated: Record<string, unknown>;
  applyAction: (actionExportName: string, payload: Record<string, unknown>) => Promise<unknown>;
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

function toCamelCase(value: string): string {
  const words = value.match(/[A-Za-z0-9]+/g) ?? [];
  return words
    .map((word, index) => {
      const normalized = word.toLowerCase();
      return index === 0 ? normalized : `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}`;
    })
    .join("");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

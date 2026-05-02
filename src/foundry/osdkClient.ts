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
      const action = generated[actionExportName];
      if (action === undefined) {
        throw new Error(
          `Generated OSDK package "${config.osdkPackage}" does not export action "${actionExportName}". Override the env action name or add the action to the Developer Console app.`,
        );
      }

      const actionClient = (client as unknown as (actionDefinition: unknown) => {
        applyAction: (
          payload: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) => Promise<unknown>;
      })(action);

      return actionClient.applyAction(payload, { $returnEdits: true });
    },
  };
}

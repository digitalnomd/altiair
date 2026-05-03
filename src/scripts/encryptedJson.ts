import {
  appEncryptionFromEnv,
  maybeEncryptJsonForTransport,
} from "../security/appEnvelope.js";

const appEncryption = appEncryptionFromEnv();

export function jsonRequestBody(urlOrPath: string, body: unknown): string {
  return JSON.stringify(
    maybeEncryptJsonForTransport(body, appEncryption, {
      method: "POST",
      path: requestPath(urlOrPath),
      purpose: "node_api_request",
      senderNodeId: process.env.ALTIAIR_NODE_ID,
    }),
  );
}

function requestPath(urlOrPath: string): string {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath).pathname.replace(/\/+$/, "") || "/";
  }
  return urlOrPath.replace(/\/+$/, "") || "/";
}

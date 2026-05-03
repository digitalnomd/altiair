import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const APP_ENCRYPTED_ENVELOPE_VERSION = "altiair-app-envelope-v1";
const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface AppEncryptionAad {
  method?: string;
  path?: string;
  purpose: string;
  senderNodeId?: string;
  recipientNodeId?: string;
}

export interface AppEncryptedEnvelope {
  schemaVersion: typeof APP_ENCRYPTED_ENVELOPE_VERSION;
  algorithm: typeof ALGORITHM;
  keyId: string;
  createdAt: string;
  aad: AppEncryptionAad;
  nonce: string;
  tag: string;
  ciphertext: string;
  plaintextSha256: string;
}

export interface AppEncryptionContext {
  enabled: boolean;
  algorithm: typeof ALGORITHM;
  keyMode: "disabled" | "configured_key" | "configured_secret";
  keyId?: string;
  key?: Buffer;
}

export function appEncryptionFromEnv(env: NodeJS.ProcessEnv = process.env): AppEncryptionContext {
  const hexKey = nonEmpty(env.ALTIAIR_APP_ENCRYPTION_KEY);
  const secret = nonEmpty(env.ALTIAIR_APP_ENCRYPTION_SECRET);

  if (hexKey !== undefined) {
    const key = Buffer.from(hexKey, "hex");
    if (key.length !== 32 || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error("ALTIAIR_APP_ENCRYPTION_KEY must be a 32-byte hex value.");
    }
    return enabledContext(key, "configured_key");
  }

  if (secret !== undefined) {
    return enabledContext(createHash("sha256").update(secret, "utf8").digest(), "configured_secret");
  }

  return {
    enabled: false,
    algorithm: ALGORITHM,
    keyMode: "disabled",
  };
}

export function appEncryptionStatus(context: AppEncryptionContext): Record<string, unknown> {
  return {
    enabled: context.enabled,
    algorithm: context.algorithm,
    keyMode: context.keyMode,
    keyId: context.keyId,
  };
}

export function maybeEncryptJsonForTransport(
  body: unknown,
  context: AppEncryptionContext,
  aad: AppEncryptionAad,
): unknown {
  if (!context.enabled) {
    return body;
  }
  return encryptJsonEnvelope(body, context, aad);
}

export function maybeDecryptJsonRequestBody(
  rawBody: string,
  context: AppEncryptionContext,
  expectedAad: Pick<AppEncryptionAad, "method" | "path" | "purpose">,
): string {
  const parsed = JSON.parse(rawBody) as unknown;
  if (!isAppEncryptedEnvelope(parsed)) {
    return rawBody;
  }
  return decryptJsonEnvelopeToString(parsed, context, expectedAad);
}

export function encryptJsonEnvelope(
  body: unknown,
  context: AppEncryptionContext,
  aad: AppEncryptionAad,
): AppEncryptedEnvelope {
  const key = requireKey(context);
  const plaintext = Buffer.from(JSON.stringify(body), "utf8");
  const nonce = randomBytes(NONCE_BYTES);
  const createdAt = new Date().toISOString();
  const normalizedAad = normalizeAad(aad);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(canonicalize(normalizedAad), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    schemaVersion: APP_ENCRYPTED_ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyId: context.keyId ?? fingerprint(key),
    createdAt,
    aad: normalizedAad,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    plaintextSha256: createHash("sha256").update(plaintext).digest("hex"),
  };
}

export function decryptJsonEnvelopeToString(
  envelope: AppEncryptedEnvelope,
  context: AppEncryptionContext,
  expectedAad?: Pick<AppEncryptionAad, "method" | "path" | "purpose">,
): string {
  const key = requireKey(context);
  if (envelope.algorithm !== ALGORITHM) {
    throw new Error(`Unsupported app envelope algorithm "${envelope.algorithm}".`);
  }
  if (expectedAad !== undefined) {
    assertExpectedAad(envelope.aad, expectedAad);
  }

  const nonce = Buffer.from(envelope.nonce, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid app envelope nonce or authentication tag.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(canonicalize(normalizeAad(envelope.aad)), "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
  if (plaintextSha256 !== envelope.plaintextSha256) {
    throw new Error("App envelope plaintext digest mismatch.");
  }
  return plaintext.toString("utf8");
}

export function isAppEncryptedEnvelope(value: unknown): value is AppEncryptedEnvelope {
  return isRecord(value) &&
    value.schemaVersion === APP_ENCRYPTED_ENVELOPE_VERSION &&
    value.algorithm === ALGORITHM &&
    typeof value.keyId === "string" &&
    typeof value.createdAt === "string" &&
    isRecord(value.aad) &&
    typeof value.nonce === "string" &&
    typeof value.tag === "string" &&
    typeof value.ciphertext === "string" &&
    typeof value.plaintextSha256 === "string";
}

function enabledContext(key: Buffer, keyMode: "configured_key" | "configured_secret"): AppEncryptionContext {
  return {
    enabled: true,
    algorithm: ALGORITHM,
    keyMode,
    keyId: fingerprint(key),
    key,
  };
}

function requireKey(context: AppEncryptionContext): Buffer {
  if (!context.enabled || context.key === undefined) {
    throw new Error("ALTIAIR_APP_ENCRYPTION_KEY or ALTIAIR_APP_ENCRYPTION_SECRET is required.");
  }
  return context.key;
}

function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function normalizeAad(aad: AppEncryptionAad): AppEncryptionAad {
  return {
    purpose: aad.purpose,
    ...(aad.method === undefined ? {} : { method: aad.method.toUpperCase() }),
    ...(aad.path === undefined ? {} : { path: aad.path }),
    ...(aad.senderNodeId === undefined ? {} : { senderNodeId: aad.senderNodeId }),
    ...(aad.recipientNodeId === undefined ? {} : { recipientNodeId: aad.recipientNodeId }),
  };
}

function assertExpectedAad(
  aad: AppEncryptionAad,
  expected: Pick<AppEncryptionAad, "method" | "path" | "purpose">,
): void {
  const normalized = normalizeAad(aad);
  const normalizedExpected = normalizeAad(expected);
  for (const field of ["method", "path", "purpose"] as const) {
    if (normalized[field] !== normalizedExpected[field]) {
      throw new Error(`App envelope AAD mismatch for ${field}.`);
    }
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

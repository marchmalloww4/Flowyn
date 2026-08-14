import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getSecretKey, type IntegrationSecretContext } from "@/lib/security/keyring";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const ENVELOPE_VERSION = "flowyn-webhook-secret-v1";
const INTEGRATION_ENVELOPE_VERSION = "flowyn-integration-secret-v1";

export interface WebhookSecretContext {
  encryptionKey: Uint8Array;
  keyVersion: string;
  triggerId: string;
  secretVersion: number;
}

function assertKey(key: Uint8Array): Buffer {
  const buffer = Buffer.from(key);
  if (buffer.length !== KEY_BYTES) {
    throw new Error("Webhook secret encryption key must be exactly 32 bytes.");
  }
  return buffer;
}

function associatedData(context: WebhookSecretContext): Buffer {
  return Buffer.from(`${ENVELOPE_VERSION}:${context.keyVersion}:${context.triggerId}:${context.secretVersion}`, "utf8");
}

function encode(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSecret(plaintext: string, context: WebhookSecretContext): string {
  if (plaintext.length === 0 || plaintext.length > 4096) {
    throw new Error("Webhook secret has an invalid length.");
  }

  const key = assertKey(context.encryptionKey);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, context.keyVersion, encode(nonce), encode(ciphertext), encode(tag)].join(".");
}

export function decryptWebhookSecret(envelope: string, context: WebhookSecretContext): string {
  const [version, keyVersion, encodedNonce, encodedCiphertext, encodedTag, extra] = envelope.split(".");
  if (extra !== undefined || version !== ENVELOPE_VERSION || keyVersion !== context.keyVersion) {
    throw new Error("Webhook secret envelope is invalid.");
  }

  const nonce = decode(encodedNonce ?? "");
  const ciphertext = decode(encodedCiphertext ?? "");
  const tag = decode(encodedTag ?? "");
  if (nonce.length !== NONCE_BYTES || tag.length !== 16) {
    throw new Error("Webhook secret envelope is invalid.");
  }

  const key = assertKey(context.encryptionKey);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Webhook secret envelope is invalid.");
  }
}

function integrationAssociatedData(context: IntegrationSecretContext, keyVersion: string): Buffer {
  return Buffer.from(`${INTEGRATION_ENVELOPE_VERSION}:${keyVersion}:${context.connectorId}:${context.credentialId}:${context.secretVersion}`, "utf8");
}

function integrationEnvelopeError(): Error {
  return new Error("Integration secret envelope is invalid.");
}

export function encryptIntegrationSecret(plaintext: string, context: IntegrationSecretContext): string {
  if (plaintext.length === 0 || plaintext.length > 4096 || !Number.isInteger(context.secretVersion) || context.secretVersion < 1) throw new Error("Integration secret is invalid.");
  const keyVersion = context.currentKeyVersion;
  const key = Buffer.from(getSecretKey(context.keyring, keyVersion));
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(integrationAssociatedData(context, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [INTEGRATION_ENVELOPE_VERSION, keyVersion, encode(nonce), encode(ciphertext), encode(tag)].join(".");
}

export function decryptIntegrationSecret(envelope: string, context: IntegrationSecretContext): string {
  const [version, keyVersion, encodedNonce, encodedCiphertext, encodedTag, extra] = envelope.split(".");
  if (extra !== undefined || version !== INTEGRATION_ENVELOPE_VERSION || !keyVersion || !encodedNonce || !encodedCiphertext || !encodedTag) throw integrationEnvelopeError();
  const nonce = decode(encodedNonce);
  const ciphertext = decode(encodedCiphertext);
  const tag = decode(encodedTag);
  if (nonce.length !== NONCE_BYTES || tag.length !== 16) throw integrationEnvelopeError();
  try {
    const key = Buffer.from(getSecretKey(context.keyring, keyVersion));
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(integrationAssociatedData(context, keyVersion));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw integrationEnvelopeError();
  }
}

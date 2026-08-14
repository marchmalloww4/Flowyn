import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { WEBHOOK_POLICY } from "@/lib/webhooks/policy";
import type { WebhookDedupeKey } from "@/lib/webhooks/types";

function sortJsonValue(value: unknown, depth = 0): unknown {
  if (depth > WEBHOOK_POLICY.maxDepth) {
    throw new Error("Webhook payload is too deeply nested.");
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > WEBHOOK_POLICY.maxStringChars) {
      throw new Error("Webhook payload contains an oversized string.");
    }
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Webhook payload contains a non-finite number.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > WEBHOOK_POLICY.maxArrayItems) {
      throw new Error("Webhook payload contains too many array items.");
    }
    return value.map((item) => sortJsonValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > WEBHOOK_POLICY.maxObjectKeys) {
      throw new Error("Webhook payload contains too many object keys.");
    }
    return Object.fromEntries(
      entries
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, sortJsonValue(nested, depth + 1)]),
    );
  }

  throw new Error("Webhook payload contains an unsupported value.");
}

export function canonicalizeWebhookPayload(value: unknown): string {
  const canonical = JSON.stringify(sortJsonValue(value));
  if (canonical === undefined || canonical.length > WEBHOOK_POLICY.maxInputChars) {
    throw new Error("Webhook payload is too large.");
  }
  return canonical;
}

export function hashWebhookPayload(value: unknown): string {
  return createHash("sha256").update(canonicalizeWebhookPayload(value), "utf8").digest("hex");
}

export function buildSignedMessage(timestamp: string, rawBody: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), Buffer.from(rawBody)]);
}

export function createWebhookSignature(secret: Uint8Array | string, message: Uint8Array): string {
  return `v1=${createHmac("sha256", secret).update(message).digest("hex")}`;
}

export function verifyWebhookSignature(secret: Uint8Array | string, message: Uint8Array, signature: string): boolean {
  if (!/^v1=[0-9a-f]{64}$/.test(signature)) {
    return false;
  }

  const expected = Buffer.from(createWebhookSignature(secret, message).slice(3), "hex");
  const supplied = Buffer.from(signature.slice(3), "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function normalizeWebhookEventId(eventId: string | null | undefined): string | null {
  if (eventId === undefined || eventId === null) {
    return null;
  }
  const normalized = eventId.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > WEBHOOK_POLICY.maxEventIdChars || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Webhook event ID is invalid.");
  }
  return normalized;
}

export function createWebhookDedupeKey(input: {
  eventId: string | null;
  nowSeconds: number;
  replayWindowSeconds: number;
  payloadHash: string;
}): WebhookDedupeKey {
  if (input.eventId !== null) {
    const externalEventIdHash = createHash("sha256").update(input.eventId, "utf8").digest("hex");
    return {
      key: `event:${externalEventIdHash}`,
      externalEventIdHash,
      dedupeWindowStart: null,
    };
  }

  const windowStartSeconds = Math.floor(input.nowSeconds / input.replayWindowSeconds) * input.replayWindowSeconds;
  return {
    key: `payload:${input.payloadHash}:${windowStartSeconds}`,
    externalEventIdHash: null,
    dedupeWindowStart: new Date(windowStartSeconds * 1000),
  };
}

export function createWebhookIdempotencyKey(triggerId: string, dedupeKey: string): string {
  const materialHash = createHash("sha256").update(`${triggerId}:${dedupeKey}`, "utf8").digest("hex");
  return `workflow-webhook:${triggerId}:${materialHash}`;
}

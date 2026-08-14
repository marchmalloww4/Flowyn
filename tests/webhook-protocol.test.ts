import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSignedMessage,
  canonicalizeWebhookPayload,
  createWebhookSignature,
  createWebhookDedupeKey,
  createWebhookIdempotencyKey,
  hashWebhookPayload,
  normalizeWebhookEventId,
  verifyWebhookSignature,
} from "@/lib/webhooks/protocol";

describe("webhook protocol", () => {
  const secret = Buffer.from("webhook-secret");

  it("signs the exact raw body bytes", () => {
    const body = Buffer.from('{"message":"café"}', "utf8");
    const message = buildSignedMessage("1700000000", body);
    const signature = createWebhookSignature(secret, message);

    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, message, signature)).toBe(true);
    expect(verifyWebhookSignature(secret, buildSignedMessage("1700000000", Buffer.from('{"message":"cafe"}')), signature)).toBe(false);
  });

  it("canonicalizes bounded JSON deterministically and hashes it", () => {
    const first = canonicalizeWebhookPayload({ b: 2, a: 1 });
    const second = canonicalizeWebhookPayload({ a: 1, b: 2 });
    expect(first).toBe(second);
    expect(hashWebhookPayload({ b: 2, a: 1 })).toBe(createHash("sha256").update(first).digest("hex"));
  });

  it("uses hashed event IDs and bounded payload replay buckets", () => {
    const eventId = normalizeWebhookEventId(" delivery-42 ");
    expect(eventId).toBe("delivery-42");
    expect(createWebhookDedupeKey({ eventId, nowSeconds: 1_700_000_123, replayWindowSeconds: 300, payloadHash: "abc" })).toEqual({
      key: `event:${createHash("sha256").update("delivery-42").digest("hex")}`,
      externalEventIdHash: createHash("sha256").update("delivery-42").digest("hex"),
      dedupeWindowStart: null,
    });
    expect(createWebhookDedupeKey({ eventId: null, nowSeconds: 1_700_000_123, replayWindowSeconds: 300, payloadHash: "abc" })).toEqual({
      key: "payload:abc:1700000100",
      externalEventIdHash: null,
      dedupeWindowStart: expect.any(Date),
    });
  });

  it("creates a deterministic workflow idempotency key within the workflow limit", () => {
    const key = createWebhookIdempotencyKey("11111111-1111-4111-8111-111111111111", "event:" + "a".repeat(64));
    expect(key).toHaveLength(118);
    expect(key).toBe(createWebhookIdempotencyKey("11111111-1111-4111-8111-111111111111", "event:" + "a".repeat(64)));
    expect(key).not.toBe(createWebhookIdempotencyKey("11111111-1111-4111-8111-111111111111", "event:" + "b".repeat(64)));
  });
});

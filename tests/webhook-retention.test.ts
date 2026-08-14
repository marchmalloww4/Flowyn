import { describe, expect, it } from "vitest";
import { getWebhookEventExpiry, normalizeWebhookCleanupBatch, isWebhookEventExpired } from "@/lib/webhooks/retention";

describe("webhook event retention", () => {
  it("calculates expiry from received time", () => {
    const receivedAt = new Date("2026-08-14T00:00:00.000Z");
    expect(getWebhookEventExpiry(receivedAt, 30)).toEqual(new Date("2026-09-13T00:00:00.000Z"));
    expect(isWebhookEventExpired(new Date("2026-09-13T00:00:00.000Z"), new Date("2026-09-13T00:00:01.000Z"))).toBe(true);
  });

  it("bounds cleanup batches", () => {
    expect(normalizeWebhookCleanupBatch(undefined)).toBe(100);
    expect(normalizeWebhookCleanupBatch(0)).toBe(1);
    expect(normalizeWebhookCleanupBatch(5000)).toBe(500);
  });
});

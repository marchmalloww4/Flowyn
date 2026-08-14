import { describe, expect, it } from "vitest";
import { WEBHOOK_POLICY, validateWebhookTimestamp } from "@/lib/webhooks/policy";

describe("webhook policy", () => {
  it("exposes bounded defaults", () => {
    expect(WEBHOOK_POLICY.maxBodyBytes).toBe(262_144);
    expect(WEBHOOK_POLICY.maxEventIdChars).toBeGreaterThan(0);
    expect(WEBHOOK_POLICY.replayWindowSeconds).toBe(300);
    expect(WEBHOOK_POLICY.eventRetentionDays).toBe(30);
  });

  it("accepts timestamps at the replay boundary and rejects stale values", () => {
    const now = 1_700_000_000;
    expect(validateWebhookTimestamp(String(now - 300), now, 300)).toEqual({ ok: true, timestamp: now - 300 });
    expect(validateWebhookTimestamp(String(now - 301), now, 300)).toEqual({ ok: false, reason: "replay_window" });
    expect(validateWebhookTimestamp("not-a-timestamp", now, 300)).toEqual({ ok: false, reason: "timestamp" });
  });
});

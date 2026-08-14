import { describe, expect, it } from "vitest";
import { consumeWebhookRateLimit, type WebhookRateLimitRedis } from "@/lib/webhooks/rate-limit";

function redis(counts: [number, number]): WebhookRateLimitRedis {
  const commands: Array<[string, string | number]> = [];
  const chain = {
    incr: (key: string) => { commands.push(["incr", key]); return chain; },
    expire: (key: string, seconds: number) => { void seconds; commands.push(["expire", key]); return chain; },
    exec: async () => [[null, counts[0]], [null, 1], [null, counts[1]], [null, 1]] as Array<[null, number]>,
  };
  return { multi: () => chain };
}

describe("webhook admission rate limiting", () => {
  it("enforces global and per-trigger limits", async () => {
    await expect(consumeWebhookRateLimit("public-1", { redis: redis([3, 1]), globalLimit: 2, triggerLimit: 2, now: 1_700_000_000_000 })).resolves.toEqual({ allowed: false, scope: "global" });
    await expect(consumeWebhookRateLimit("public-1", { redis: redis([1, 3]), globalLimit: 2, triggerLimit: 2, now: 1_700_000_000_000 })).resolves.toEqual({ allowed: false, scope: "trigger" });
    await expect(consumeWebhookRateLimit("public-1", { redis: redis([1, 1]), globalLimit: 2, triggerLimit: 2, now: 1_700_000_000_000 })).resolves.toEqual({ allowed: true });
  });

  it("fails closed when Redis cannot execute the atomic window", async () => {
    const unavailable: WebhookRateLimitRedis = { multi: () => ({ incr: () => unavailable as never, expire: () => unavailable as never, exec: async () => { throw new Error("down"); } }) };
    await expect(consumeWebhookRateLimit("public-1", { redis: unavailable, globalLimit: 2, triggerLimit: 2 })).rejects.toMatchObject({ code: "WEBHOOK_RATE_LIMIT_UNAVAILABLE", status: 503 });
  });
});

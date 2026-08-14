import { AppError } from "@/lib/security/errors";

type WebhookRateLimitMulti = {
  incr(key: string): WebhookRateLimitMulti;
  expire(key: string, seconds: number): WebhookRateLimitMulti;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
};

export type WebhookRateLimitRedis = {
  multi(): WebhookRateLimitMulti;
};

export type WebhookRateLimitResult = { allowed: true } | { allowed: false; scope: "global" | "trigger" };

export async function consumeWebhookRateLimit(
  publicId: string,
  options: {
    redis: WebhookRateLimitRedis;
    globalLimit: number;
    triggerLimit: number;
    now?: number;
  },
): Promise<WebhookRateLimitResult> {
  const bucket = Math.floor((options.now ?? Date.now()) / 60_000);
  const globalKey = `flowyn:webhook:rate:global:${bucket}`;
  const triggerKey = `flowyn:webhook:rate:trigger:${publicId}:${bucket}`;
  try {
    const result = await options.redis.multi()
      .incr(globalKey)
      .expire(globalKey, 65)
      .incr(triggerKey)
      .expire(triggerKey, 65)
      .exec();
    const globalCount = Number(result?.[0]?.[1]);
    const triggerCount = Number(result?.[2]?.[1]);
    if (!Number.isFinite(globalCount) || !Number.isFinite(triggerCount)) throw new Error("Redis returned an invalid rate-limit result.");
    if (globalCount > options.globalLimit) return { allowed: false, scope: "global" };
    if (triggerCount > options.triggerLimit) return { allowed: false, scope: "trigger" };
    return { allowed: true };
  } catch {
    throw new AppError("WEBHOOK_RATE_LIMIT_UNAVAILABLE", 503, "Webhook service is temporarily unavailable.");
  }
}

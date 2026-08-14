import { AppError } from "@/lib/security/errors";

type RateLimitMulti = {
  incr(key: string): RateLimitMulti;
  expire(key: string, seconds: number): RateLimitMulti;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
};

export type WorkspaceRateLimitRedis = { multi(): RateLimitMulti };
export type WorkspaceRateLimitResult = { allowed: true } | { allowed: false };

export async function consumeWorkspaceRateLimit(
  workspaceId: string,
  operationClass: string,
  options: { redis: WorkspaceRateLimitRedis; limit: number; now?: number },
): Promise<WorkspaceRateLimitResult> {
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("Workspace rate limit must be a positive integer.");
  const bucket = Math.floor((options.now ?? Date.now()) / 60_000);
  const key = `flowyn:usage:rate:${workspaceId}:${operationClass}:${bucket}`;
  try {
    const result = await options.redis.multi().incr(key).expire(key, 65).exec();
    const count = Number(result?.[0]?.[1]);
    if (!Number.isFinite(count)) throw new Error("Redis returned an invalid rate-limit result.");
    return count > options.limit ? { allowed: false } : { allowed: true };
  } catch {
    throw new AppError("WORKSPACE_RATE_LIMIT_UNAVAILABLE", 503, "Workspace rate limiting is temporarily unavailable.");
  }
}

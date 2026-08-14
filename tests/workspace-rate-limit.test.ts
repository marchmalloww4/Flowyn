import { describe, expect, it } from "vitest";
import { consumeWorkspaceRateLimit } from "@/lib/usage/rate-limit";

function redisFor(count: number, fail = false) {
  const commands: string[] = [];
  const multi = {
    incr(key: string) { commands.push(`incr:${key}`); return multi; },
    expire(key: string, seconds: number) { commands.push(`expire:${key}:${seconds}`); return multi; },
    exec: async (): Promise<Array<[Error | null, unknown]>> => fail ? Promise.reject(new Error("redis unavailable")) : [[null, count], [null, 1]],
  };
  return { multi: () => multi, commands };
}

describe("workspace short-window rate limits", () => {
  it("allows an operation below the configured limit", async () => {
    const redis = redisFor(2);
    await expect(consumeWorkspaceRateLimit("workspace-1", "AI", { redis, limit: 3, now: 0 })).resolves.toEqual({ allowed: true });
    expect(redis.commands.some((command) => command.startsWith("incr:flowyn:usage:rate:workspace-1:AI:"))).toBe(true);
  });

  it("rejects an operation above the configured limit", async () => {
    const redis = redisFor(4);
    await expect(consumeWorkspaceRateLimit("workspace-1", "AI", { redis, limit: 3, now: 60_000 })).resolves.toEqual({ allowed: false });
  });
});

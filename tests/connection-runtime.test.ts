import { describe, expect, it } from "vitest";
import { getDatabaseClientOptions } from "@/lib/database/client";
import { getRedisConnectionOptions } from "@/lib/queue/connection";

function env(overrides: Record<string, unknown> = {}) {
  return {
    DATABASE_POOL_MAX: 7,
    DATABASE_CONNECT_TIMEOUT_SECONDS: 4,
    DATABASE_IDLE_TIMEOUT_SECONDS: 19,
    REDIS_CONNECT_TIMEOUT_MS: 2400,
    REDIS_URL: "rediss://redis.example:6380",
    ...overrides,
  } as never;
}

describe("production connection contracts", () => {
  it("uses bounded database pool and timeout settings", () => {
    expect(getDatabaseClientOptions(env())).toMatchObject({
      max: 7,
      connect_timeout: 4,
      idle_timeout: 19,
    });
  });

  it("preserves BullMQ retry semantics and enables Redis TLS for rediss URLs", () => {
    expect(getRedisConnectionOptions(env(), "worker")).toMatchObject({
      maxRetriesPerRequest: null,
      connectTimeout: 2400,
      tls: {},
    });
  });

  it("uses bounded retries for scheduler and health-check Redis probes", () => {
    expect(getRedisConnectionOptions(env({ REDIS_URL: "redis://redis:6379" }), "probe")).toMatchObject({
      maxRetriesPerRequest: 1,
      connectTimeout: 2400,
    });
  });
});

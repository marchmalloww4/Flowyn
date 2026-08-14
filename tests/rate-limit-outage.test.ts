import { describe, expect, it } from "vitest";
import { consumeWorkspaceRateLimit } from "@/lib/usage/rate-limit";

describe("workspace rate-limit outage behavior", () => {
  it("fails closed when Redis is unavailable", async () => {
    const redis = { multi: () => ({
      incr: () => ({}) as never,
      expire: () => ({}) as never,
      exec: async (): Promise<Array<[Error | null, unknown]>> => { throw new Error("redis unavailable"); },
    }) };

    await expect(consumeWorkspaceRateLimit("workspace-1", "INTEGRATION", { redis, limit: 3 })).rejects.toMatchObject({
      code: "WORKSPACE_RATE_LIMIT_UNAVAILABLE",
      status: 503,
    });
  });
});

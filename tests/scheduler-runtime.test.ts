import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  process: vi.fn(),
  FakeRedis: class {
    async ping() { return "PONG"; }
    async set(key: string, value: string) { state.values.set(key, value); return "OK"; }
    async get(key: string) { return state.values.get(key) ?? null; }
    async del(key: string) { state.values.delete(key); return 1; }
    async quit() { return "OK"; }
  },
}));

vi.mock("ioredis", () => ({ default: state.FakeRedis }));
vi.mock("@/lib/schedules/processor", () => ({ processDueSchedules: state.process }));

import { getSchedulerHeartbeatKey, startWorkflowScheduler } from "@/lib/schedules/scheduler";

describe("workflow scheduler runtime", () => {
  beforeEach(() => {
    state.values.clear();
    state.process.mockReset().mockResolvedValue({ claimed: 0, triggered: 0, skipped: 0, failed: 0 });
  });

  it("polls immediately, refreshes its heartbeat, and cleans up its owned key", async () => {
    const runtime = await startWorkflowScheduler({ schedulerId: "scheduler-test", pollIntervalMs: 100, heartbeatTtlSeconds: 30, process: state.process });

    expect(state.process).toHaveBeenCalledWith({ batchSize: 25 });
    expect(state.values.get(getSchedulerHeartbeatKey("scheduler-test"))).toBe("scheduler-test");

    await runtime.close();
    expect(state.values.has(getSchedulerHeartbeatKey("scheduler-test"))).toBe(false);
  });

  it("runs bounded webhook event cleanup as best-effort maintenance", async () => {
    const cleanup = vi.fn().mockResolvedValue(3);
    const runtime = await startWorkflowScheduler({ schedulerId: "scheduler-cleanup-test", pollIntervalMs: 100, heartbeatTtlSeconds: 30, process: state.process, cleanup });
    expect(cleanup).toHaveBeenCalledTimes(1);
    await runtime.close();
  });
});

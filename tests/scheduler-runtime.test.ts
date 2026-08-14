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

import { SCHEDULER_HEARTBEAT_KEY, startWorkflowScheduler } from "@/lib/schedules/scheduler";

describe("workflow scheduler runtime", () => {
  beforeEach(() => {
    state.values.clear();
    state.process.mockReset().mockResolvedValue({ claimed: 0, triggered: 0, skipped: 0, failed: 0 });
  });

  it("polls immediately, refreshes its heartbeat, and cleans up its owned key", async () => {
    const runtime = await startWorkflowScheduler({ schedulerId: "scheduler-test", pollIntervalMs: 100, heartbeatTtlSeconds: 30, process: state.process });

    expect(state.process).toHaveBeenCalledWith({ batchSize: 25 });
    expect(state.values.get(SCHEDULER_HEARTBEAT_KEY)).toBe("scheduler-test");

    await runtime.close();
    expect(state.values.has(SCHEDULER_HEARTBEAT_KEY)).toBe(false);
  });
});

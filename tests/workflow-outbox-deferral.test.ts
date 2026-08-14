import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";

const { enqueueWorkflowRun } = vi.hoisted(() => ({ enqueueWorkflowRun: vi.fn() }));
vi.mock("@/lib/workflows/queue", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflows/queue")>("@/lib/workflows/queue");
  return { ...actual, enqueueWorkflowRun: (...args: unknown[]) => enqueueWorkflowRun(...args) };
});

function database() {
  const updateSets: Array<Record<string, unknown>> = [];
  const updateRows: unknown[][] = [
    [{ id: "dispatch-1", runId: "run-1", status: "CLAIMED", attempts: 0, deferCount: 0 }],
    [{ id: "dispatch-1", runId: "run-1", status: "PENDING", attempts: 0, deferCount: 1 }],
  ];
  const db = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "dispatch-1", runId: "run-1", status: "PENDING", attempts: 0, deferCount: 0, dispatchGeneration: 0, leaseExpiresAt: null }]) }) }) }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((values: Record<string, unknown>) => {
        updateSets.push(values);
        return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(updateRows.shift() ?? []) }) };
      }),
    })),
  };
  return { db, updateSets };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workflow outbox concurrency deferral", () => {
  it("returns a claimed dispatch to pending without consuming a dispatch attempt", async () => {
    const { db, updateSets } = database();

    await expect(dispatchPendingWorkflowRuns({
      db: db as never,
      dispatcherId: "dispatcher-1",
      reserve: async () => ({ acquired: false }),
      now: new Date("2026-08-15T12:00:00.000Z"),
    })).resolves.toEqual({ dispatched: 0, failed: 0 });

    expect(enqueueWorkflowRun).not.toHaveBeenCalled();
    expect(updateSets[0]).toMatchObject({ status: "CLAIMED", attempts: 1 });
    expect(updateSets[1]).toMatchObject({ status: "PENDING", attempts: 0, deferCount: 1, deferReason: "WORKSPACE_CONCURRENCY" });
    expect(updateSets[1].nextAttemptAt).toBeInstanceOf(Date);
  });
});

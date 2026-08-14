import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowJobId } from "@/lib/workflows/queue";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";

const { enqueueWorkflowRun } = vi.hoisted(() => ({ enqueueWorkflowRun: vi.fn() }));
vi.mock("@/lib/workflows/queue", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflows/queue")>("@/lib/workflows/queue");
  return { ...actual, enqueueWorkflowRun: (...args: unknown[]) => enqueueWorkflowRun(...args) };
});

const dispatchId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function database(options: { selectRows?: unknown[]; updateRows?: unknown[][] } = {}) {
  const updateRows = [...(options.updateRows ?? [])];
  const db = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(options.selectRows ?? []) }) }) }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(updateRows.shift() ?? []) }),
      }),
    })),
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueWorkflowRun.mockResolvedValue(undefined);
});

describe("workflow outbox", () => {
  it("uses a deterministic BullMQ job ID", () => {
    expect(workflowJobId(runId)).toBe(`workflow-run:${runId}`);
  });

  it("claims and dispatches a pending run once", async () => {
    const db = database({
      selectRows: [{ id: dispatchId, runId, status: "PENDING", attempts: 0, leaseExpiresAt: null }],
      updateRows: [[{ id: dispatchId, runId, status: "CLAIMED", attempts: 1 }], [{ id: dispatchId, runId, status: "DISPATCHED", attempts: 1 }]],
    });

    await expect(dispatchPendingWorkflowRuns({ db: db as never, dispatcherId: "dispatcher-a" })).resolves.toEqual({ dispatched: 1, failed: 0 });
    expect(enqueueWorkflowRun).toHaveBeenCalledWith(runId);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("does not enqueue when the atomic claim loses a concurrent race", async () => {
    const db = database({
      selectRows: [{ id: dispatchId, runId, status: "PENDING", attempts: 0, leaseExpiresAt: null }],
      updateRows: [[]],
    });

    await expect(dispatchPendingWorkflowRuns({ db: db as never, dispatcherId: "dispatcher-b" })).resolves.toEqual({ dispatched: 0, failed: 0 });
    expect(enqueueWorkflowRun).not.toHaveBeenCalled();
  });

  it("marks enqueue failures for bounded retry", async () => {
    enqueueWorkflowRun.mockRejectedValue(new Error("redis unavailable"));
    const db = database({
      selectRows: [{ id: dispatchId, runId, status: "PENDING", attempts: 0, leaseExpiresAt: null }],
      updateRows: [[{ id: dispatchId, runId, status: "CLAIMED", attempts: 1 }], [{ id: dispatchId, runId, status: "FAILED", attempts: 1 }]],
    });

    await expect(dispatchPendingWorkflowRuns({ db: db as never, dispatcherId: "dispatcher-a" })).resolves.toEqual({ dispatched: 0, failed: 1 });
    expect(enqueueWorkflowRun).toHaveBeenCalledWith(runId);
  });
});

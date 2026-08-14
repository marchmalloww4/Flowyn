import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Worker: vi.fn(),
  workerConnection: { set: vi.fn(), get: vi.fn().mockResolvedValue("worker-a"), del: vi.fn(), quit: vi.fn() },
  dispatchPendingWorkflowRuns: vi.fn(),
  executeWorkflowRun: vi.fn(),
  processor: undefined as ((job: { data: { runId: string } }) => Promise<unknown>) | undefined,
  workerClose: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: mocks.Worker,
}));
vi.mock("@/lib/queue/connection", () => ({
  createQueueWorkerConnection: () => mocks.workerConnection,
}));
vi.mock("@/lib/workflows/outbox", () => ({
  dispatchPendingWorkflowRuns: mocks.dispatchPendingWorkflowRuns,
}));
vi.mock("@/lib/workflows/executor", () => ({
  executeWorkflowRun: mocks.executeWorkflowRun,
}));

import { startWorkflowWorker } from "@/lib/workflows/worker";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processor = undefined;
  mocks.dispatchPendingWorkflowRuns.mockResolvedValue({ dispatched: 1, failed: 0 });
  mocks.executeWorkflowRun.mockResolvedValue({ status: "COMPLETED" });
  mocks.Worker.mockImplementation((_name: string, processor: (job: { data: { runId: string } }) => Promise<unknown>) => {
    mocks.processor = processor;
    return { close: mocks.workerClose, on: vi.fn() };
  });
});

describe("workflow worker", () => {
  it("starts a BullMQ consumer, dispatches the outbox, and refreshes heartbeat", async () => {
    const worker = await startWorkflowWorker({ workerId: "worker-a", concurrency: 2 });
    expect(mocks.Worker).toHaveBeenCalledWith("flowyn-workflows", expect.any(Function), expect.objectContaining({ concurrency: 2 }));
    expect(mocks.dispatchPendingWorkflowRuns).toHaveBeenCalled();
    expect(mocks.workerConnection.set).toHaveBeenCalledWith("flowyn:worker:heartbeat", "worker-a", "EX", expect.any(Number));
    await mocks.processor?.({ data: { runId: "run-1" } });
    expect(mocks.executeWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", workerId: "worker-a" }));
    await worker.close();
    expect(mocks.workerClose).toHaveBeenCalled();
    expect(mocks.workerConnection.del).toHaveBeenCalledWith("flowyn:worker:heartbeat");
  });
});

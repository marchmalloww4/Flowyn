import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WorkflowStepError } from "@/lib/workflows/errors";
import { executeWorkflowRun } from "@/lib/workflows/executor";

const mocks = vi.hoisted(() => ({
  claimWorkflowRun: vi.fn(),
  completeWorkflowStepAndAdvance: vi.fn(),
  createWorkflowStepAttempt: vi.fn(),
  failWorkflowStep: vi.fn(),
  finishWorkflowRun: vi.fn(),
  getWorkflowRunRecord: vi.fn(),
  renewWorkflowRunLease: vi.fn(),
}));

vi.mock("@/lib/workflows/service", () => mocks);

const run = {
  id: "run-1",
  workspaceId: "workspace-1",
  workflowId: "workflow-1",
  workflowVersion: 1,
  definitionSnapshot: { schemaVersion: 1, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE", name: "Start", config: { value: { kind: "literal", value: "done" } } }] },
  status: "QUEUED",
  startedBy: "user-1",
  input: { request: "go" },
  output: null,
  currentStepId: "start",
  executionToken: "token-1",
  leaseExpiresAt: new Date(Date.now() + 60_000),
  errorCode: null,
};

const db = {
  select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
} as never;

function registry(execute: () => Promise<unknown>) {
  return { get: vi.fn().mockReturnValue({ configSchema: z.any(), execute }) } as never;
}

function resetMocks() {
  vi.clearAllMocks();
  mocks.claimWorkflowRun.mockResolvedValue({ run, executionToken: "token-1" });
  mocks.getWorkflowRunRecord.mockResolvedValue({ ...run, status: "RUNNING" });
  mocks.createWorkflowStepAttempt.mockResolvedValue({ id: "step-run-1" });
  mocks.completeWorkflowStepAndAdvance.mockResolvedValue(true);
  mocks.failWorkflowStep.mockResolvedValue(true);
  mocks.finishWorkflowRun.mockImplementation(async (_runId: string, _token: string, status: string, output: unknown, errorCode: string | null) => ({ ...run, status, output, errorCode }));
}

describe("workflow runner", () => {
  it("claims a queued run, persists durable output, and completes", async () => {
    resetMocks();
    const result = await executeWorkflowRun({ runId: "run-1", workerId: "worker-1", db, registry: registry(async () => ({ output: "done", nextStepId: null, safeMetadata: { operation: "TEST" } })) });
    expect(result).toMatchObject({ status: "COMPLETED", output: "done", stepCount: 1 });
    expect(mocks.claimWorkflowRun).toHaveBeenCalledWith("run-1", "worker-1", db);
    expect(mocks.completeWorkflowStepAndAdvance).toHaveBeenCalledWith(expect.objectContaining({ executionToken: "token-1", output: "done" }), db);
    expect(mocks.finishWorkflowRun).toHaveBeenCalledWith("run-1", "token-1", "COMPLETED", "done", null, db);
  });

  it("does not let a stale worker complete a step after lease loss", async () => {
    resetMocks();
    mocks.completeWorkflowStepAndAdvance.mockResolvedValue(false);
    const result = await executeWorkflowRun({ runId: "run-1", workerId: "worker-old", db, registry: registry(async () => ({ output: "late", nextStepId: null, safeMetadata: {} })) });
    expect(result.status).toBe("RUNNING");
    expect(mocks.finishWorkflowRun).not.toHaveBeenCalled();
  });

  it("retries only an explicitly retryable step error and keeps attempts separate", async () => {
    resetMocks();
    let calls = 0;
    const executor = registry(async () => {
      calls += 1;
      if (calls === 1) throw new WorkflowStepError("TRANSIENT_STEP", 503, "temporary", true);
      return { output: { ok: true }, nextStepId: null, safeMetadata: { operation: "TEST" } };
    });
    mocks.createWorkflowStepAttempt
      .mockResolvedValueOnce({ id: "step-run-1" })
      .mockResolvedValueOnce({ id: "step-run-2" });
    const result = await executeWorkflowRun({ runId: "run-1", workerId: "worker-1", db, registry: executor });
    expect(result).toMatchObject({ status: "COMPLETED", output: { ok: true }, stepCount: 2 });
    expect(mocks.failWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ stepRunId: "step-run-1", retryable: true }), db);
    expect(mocks.createWorkflowStepAttempt).toHaveBeenNthCalledWith(2, expect.objectContaining({ attempt: 2 }), db);
  });

  it("ignores a duplicate delivery for a terminal run", async () => {
    resetMocks();
    mocks.claimWorkflowRun.mockResolvedValue(null);
    mocks.getWorkflowRunRecord.mockResolvedValue({ ...run, status: "COMPLETED", output: "already done" });
    await expect(executeWorkflowRun({ runId: "run-1", workerId: "worker-1", db })).resolves.toMatchObject({ status: "COMPLETED", output: "already done" });
  });
});

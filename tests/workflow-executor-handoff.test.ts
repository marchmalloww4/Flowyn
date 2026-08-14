import { describe, expect, it, vi } from "vitest";

const workflowService = vi.hoisted(() => ({ claimWorkflowRun: vi.fn(), getWorkflowRunRecord: vi.fn() }));
const concurrency = vi.hoisted(() => ({ transferWorkspaceReservation: vi.fn().mockResolvedValue(false), releaseWorkspaceReservation: vi.fn() }));
const recovery = vi.hoisted(() => ({ recoverExpiredWorkflowDispatch: vi.fn().mockResolvedValue(true) }));

vi.mock("@/lib/workflows/service", () => workflowService);
vi.mock("@/lib/concurrency/service", () => concurrency);
vi.mock("@/lib/workflows/outbox", () => recovery);

import { executeWorkflowRun } from "@/lib/workflows/executor";

describe("workflow executor dispatch handoff", () => {
  it("recovers an expired handoff without claiming or executing the queued run", async () => {
    workflowService.getWorkflowRunRecord.mockResolvedValue({ id: "run-1", workspaceId: "workspace-1", status: "QUEUED", output: null, errorCode: null });

    await expect(executeWorkflowRun({ runId: "run-1", workerId: "worker-1", dispatchHandoff: { reservationId: "reservation-1", reservationOwnerId: "dispatcher-1", generation: 0, correlationId: "corr-1" }, db: {} as never })).resolves.toMatchObject({ runId: "run-1", status: "QUEUED" });
    expect(concurrency.transferWorkspaceReservation).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "reservation-1", fromOwnerId: "dispatcher-1", toOwnerId: "worker-1" }), expect.anything());
    expect(recovery.recoverExpiredWorkflowDispatch).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", generation: 0 }), expect.anything());
    expect(workflowService.claimWorkflowRun).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { recoverExpiredWorkflowDispatch } from "@/lib/workflows/outbox";

describe("workflow dispatch handoff recovery", () => {
  it("returns an expired dispatched handoff to pending with a new generation", async () => {
    const updateValues: Record<string, unknown>[] = [];
    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ runId: "run-1", status: "DISPATCHED", dispatchGeneration: 0, deferCount: 1 }]) }) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockImplementation((values: Record<string, unknown>) => { updateValues.push(values); return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ runId: "run-1", status: "PENDING" }]) }) }; }) }),
    };

    await expect(recoverExpiredWorkflowDispatch({ runId: "run-1", generation: 0, now: new Date("2026-08-15T12:00:00Z") }, db as never)).resolves.toBe(true);
    expect(updateValues[0]).toMatchObject({ status: "PENDING", deferCount: 2, deferReason: "WORKFLOW_HANDOFF_EXPIRED" });
    expect(updateValues[0]?.nextAttemptAt).toBeInstanceOf(Date);
  });
});

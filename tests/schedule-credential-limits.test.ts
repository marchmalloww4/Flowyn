import { beforeEach, describe, expect, it, vi } from "vitest";

const policy = vi.hoisted(() => ({ getWorkspaceUsagePolicy: vi.fn().mockReturnValue({ plan: "SELF_HOSTED", workspaceId: "workspace-a", limits: { activeSchedules: 2, integrationCredentials: 2 } }) }));
vi.mock("@/lib/usage/policy", () => policy);
vi.mock("@/lib/workflows/service", () => ({ getWorkflow: vi.fn().mockResolvedValue({ id: "workflow-a", workspaceId: "workspace-a" }) }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { createWorkflowSchedule } from "@/lib/schedules/service";

function database(activeSchedules: number) {
  const schedule = { id: "schedule-a", workspaceId: "workspace-a", workflowId: "workflow-a", enabled: true };
  const tx = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ for: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "workspace-a" }]) }), limit: vi.fn().mockResolvedValue([{ activeSchedules }]) }) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([schedule]) }) }),
  };
  return { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

const input = { workspaceId: "workspace-a", workflowId: "workflow-a", schedule: { type: "INTERVAL", intervalSeconds: 60, timezone: "UTC", misfirePolicy: "FIRE_ONCE", input: {} } };

describe("schedule and credential workspace limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects creating a schedule when active schedule capacity is full", async () => {
    const db = database(2);
    await expect(createWorkflowSchedule("user-a", input, db as never)).rejects.toMatchObject({ code: "WORKSPACE_QUOTA_EXCEEDED", status: 429 });
    expect(db.tx.insert).not.toHaveBeenCalled();
  });
});

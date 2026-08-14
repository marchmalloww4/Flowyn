import { beforeEach, describe, expect, it, vi } from "vitest";

const usage = vi.hoisted(() => ({ admitAgentRun: vi.fn().mockResolvedValue(undefined) }));
const reservations = vi.hoisted(() => ({
  acquireWorkspaceReservation: vi.fn().mockResolvedValue({ acquired: true, duplicate: false, reservation: { id: "reservation-1", ownerId: "user-a" } }),
  releaseWorkspaceReservation: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/usage/service", () => usage);
vi.mock("@/lib/concurrency/service", () => reservations);
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn().mockResolvedValue({}), requireWorkspaceMember: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { startAgentRun } from "@/lib/agents/service";

const agent = { id: "agent-a", workspaceId: "workspace-a", brandId: null, name: "Agent", description: "", systemInstructions: "", allowedTools: [], enabled: true, maxSteps: 3, deletedAt: null };
const run = { id: "run-a", workspaceId: "workspace-a", agentId: "agent-a", agentName: "Agent", status: "RUNNING" };

function database() {
  return {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([agent]) }) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([run]) }) }),
  };
}

describe("agent run admission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reserves workspace agent capacity before durable run admission", async () => {
    const db = database();
    const result = await startAgentRun("user-a", "agent-a", "answer", db as never, { operationKey: "agent-start:req-1", sourceType: "AGENT_RUN", sourceId: "req-1" });

    expect(reservations.acquireWorkspaceReservation).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", operationClass: "AGENT", sourceId: "agent-start:req-1", ownerId: "user-a", limit: 2 }), db);
    expect(usage.admitAgentRun).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", operationKey: "agent-start:req-1", sourceType: "AGENT_RUN", db }));
    await result.releaseReservation?.();
    expect(reservations.releaseWorkspaceReservation).toHaveBeenCalledWith(expect.objectContaining({ reservationId: "reservation-1", workspaceId: "workspace-a", ownerId: "user-a" }), db);
  });

  it("rejects at capacity without consuming an agent-run unit", async () => {
    reservations.acquireWorkspaceReservation.mockResolvedValueOnce({ acquired: false, duplicate: false });
    const db = database();

    await expect(startAgentRun("user-a", "agent-a", "answer", db as never, { operationKey: "agent-start:req-2", sourceType: "AGENT_RUN", sourceId: "req-2" })).rejects.toMatchObject({ code: "WORKSPACE_CONCURRENCY_LIMIT", status: 429 });
    expect(usage.admitAgentRun).not.toHaveBeenCalled();
  });
});

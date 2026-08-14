import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { AppError } from "@/lib/security/errors";
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from "@/lib/agents/service";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn(), requireWorkspaceMember: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";

const agent = {
  id: agentId,
  workspaceId,
  brandId,
  name: "Research agent",
  description: "Finds brand facts",
  systemInstructions: "Use the allowed tools.",
  allowedTools: ["search_brand_knowledge"],
  enabled: true,
  maxSteps: 5,
  createdBy: "user-a",
  createdAt: new Date("2026-08-14T00:00:00Z"),
  updatedAt: new Date("2026-08-14T00:00:00Z"),
  deletedAt: null,
};

function database(options: { selectRows?: unknown[]; returningRows?: unknown[] } = {}) {
  const selectRows = options.selectRows ?? [agent];
  const returningRows = options.returningRows ?? [agent];
  const selectLimit = vi.fn().mockResolvedValue(selectRows);
  const selectOrder = vi.fn().mockResolvedValue(selectRows);
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit, orderBy: selectOrder });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const insertReturning = vi.fn().mockResolvedValue(returningRows);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const updateReturning = vi.fn().mockResolvedValue(returningRows);
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const transactionUpdate = vi.fn().mockReturnValue({ set: updateSet });
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ update: transactionUpdate }));
  return { select: vi.fn().mockReturnValue({ from: selectFrom }), insert: vi.fn().mockReturnValue({ values: insertValues }), update: vi.fn().mockReturnValue({ set: updateSet }), transaction, updateSet, updateReturning, insertValues };
}

describe("agent definition service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId, userId: "user-a", role: "MEMBER" } as never);
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId: "user-a", role: "ADMIN" } as never);
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId } as never);
  });

  it("creates a workspace-owned agent after validating its brand and tools", async () => {
    const db = database();
    await expect(createAgent("user-a", { workspaceId, brandId, name: "Research agent", description: "Finds brand facts", systemInstructions: "Use the allowed tools.", allowedTools: ["search_brand_knowledge"], enabled: true, maxSteps: 5 }, db as never)).resolves.toMatchObject({ id: agentId });

    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-a", workspaceId, "agent.write", db);
    expect(getBrand).toHaveBeenCalledWith("user-a", brandId, db);
    expect(db.insertValues).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, brandId, createdBy: "user-a", allowedTools: ["search_brand_knowledge"] }));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "agent.created", resourceType: "agent" }), db);
  });

  it("rejects an agent brand from another workspace without writing", async () => {
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId: "44444444-4444-4444-8444-444444444444" } as never);
    const db = database();

    await expect(createAgent("user-a", { workspaceId, brandId, name: "Research agent", description: "", systemInstructions: "", allowedTools: [], enabled: true, maxSteps: 5 }, db as never)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects unknown configured tools before writing an agent", async () => {
    const db = database();

    await expect(createAgent("user-a", { workspaceId, name: "Unsafe agent", description: "", systemInstructions: "", allowedTools: ["shell"], enabled: true, maxSteps: 5 }, db as never)).rejects.toMatchObject({ code: "AGENT_UNKNOWN_TOOL" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("updates an agent through the workspace write action", async () => {
    const db = database();
    await expect(updateAgent("user-a", agentId, { name: "Updated agent", enabled: false }, db as never)).resolves.toMatchObject({ id: agentId });

    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-a", workspaceId, "agent.write", db);
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated agent", enabled: false, updatedAt: expect.any(Date) }));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "agent.updated", resourceType: "agent" }), db);
  });

  it("soft-deletes an agent and preserves its definition row for history", async () => {
    const deleted = { ...agent, enabled: false, deletedAt: new Date("2026-08-14T00:00:01Z") };
    const db = database({ returningRows: [deleted] });

    await expect(deleteAgent("user-a", agentId, db as never)).resolves.toBeUndefined();

    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-a", workspaceId, "agent.delete", db);
    expect(db.transaction).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "agent.deleted", resourceType: "agent" }), expect.anything());
  });

  it("returns a non-leaking not-found error for an inaccessible agent", async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found."));
    const db = database();

    await expect(getAgent("user-a", agentId, db as never)).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND", status: 404 });
  });

  it("lists only through the authorized workspace service", async () => {
    const db = database();
    await expect(listAgents("user-a", workspaceId, db as never)).resolves.toEqual([agent]);
    expect(requireWorkspaceMember).toHaveBeenCalledWith("user-a", workspaceId, db);
  });
});

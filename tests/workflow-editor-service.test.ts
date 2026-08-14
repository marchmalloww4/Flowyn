import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAgent } from "@/lib/agents/service";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { workflowEditorLayouts, workflowVersions, workflows } from "@/lib/database/schema";
import { AppError } from "@/lib/security/errors";
import { getWorkflowEditorProjection, updateWorkflow } from "@/lib/workflows/service";

vi.mock("@/lib/agents/service", () => ({ getAgent: vi.fn() }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn(), requireWorkspaceMember: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const nextVersionId = "44444444-4444-4444-8444-444444444444";
const userId = "user-a";

const definition = {
  schemaVersion: 1 as const,
  entryStepId: "set",
  steps: [{ id: "set", type: "SET_VALUE" as const, name: "Set", config: { value: { kind: "literal" as const, value: "violet" } } }],
};

const workflow = {
  id: workflowId,
  workspaceId,
  name: "Campaign workflow",
  description: "",
  enabled: false,
  currentVersion: 1,
  currentVersionId: versionId,
  createdBy: userId,
  createdAt: new Date("2026-08-14T00:00:00Z"),
  updatedAt: new Date("2026-08-14T00:00:00Z"),
  deletedAt: null,
};

const version = {
  id: versionId,
  workflowId,
  workspaceId,
  version: 1,
  definition,
  definitionHash: "hash",
  createdBy: userId,
  createdAt: new Date("2026-08-14T00:00:00Z"),
};

const layout = {
  id: "55555555-5555-4555-8555-555555555555",
  workspaceId,
  workflowId,
  workflowVersionId: versionId,
  layout: { nodes: [{ id: "set", x: 120, y: 80 }], viewport: { x: 0, y: 0, zoom: 1 } },
  updatedBy: userId,
  createdAt: new Date("2026-08-14T00:00:00Z"),
  updatedAt: new Date("2026-08-14T00:00:00Z"),
};

function selectResult(rows: unknown[]) {
  return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }) };
}

function projectionDatabase(layoutRows: unknown[] = [layout]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockImplementation((table) => {
        if (table === workflows) return selectResult([workflow]);
        if (table === workflowVersions) return selectResult([version]);
        if (table === workflowEditorLayouts) return selectResult(layoutRows);
        throw new Error("Unexpected table in projection test.");
      }),
    }),
  };
}

function insertResult(rows: unknown[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

function updateResult(rows: unknown[]) {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) }) };
}

function updateDatabase(current = workflow) {
  const tx = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ for: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([current]) }) }) }) }),
    insert: vi.fn().mockReturnValue(insertResult([{ ...version, id: nextVersionId, version: 2 }])),
    update: vi.fn().mockReturnValue(updateResult([{ ...current, currentVersion: 2, currentVersionId: nextVersionId }])),
  };
  return {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockImplementation((table) => ({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(table === workflowVersions ? [version] : [current]) }) })) }),
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    tx,
  };
}

describe("workflow editor service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId, role: "ADMIN" } as never);
    vi.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId, userId, role: "MEMBER" } as never);
    vi.mocked(getAgent).mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666", workspaceId, enabled: true } as never);
  });

  it("returns the current definition and a compatible persisted layout", async () => {
    const result = await getWorkflowEditorProjection(userId, workflowId, projectionDatabase() as never);

    expect(result).toMatchObject({ workflow, definition, currentVersionId: versionId, currentVersion: 1, layout: layout.layout });
    expect(requireWorkspaceMember).toHaveBeenCalledWith(userId, workspaceId, expect.anything());
  });

  it("falls back to a safe default layout when the persisted layout belongs to another version", async () => {
    const result = await getWorkflowEditorProjection(userId, workflowId, projectionDatabase([{ ...layout, workflowVersionId: nextVersionId }]) as never);

    expect(result.layout).toEqual({ nodes: [{ id: "set", x: 0, y: 0 }], viewport: { x: 0, y: 0, zoom: 1 } });
  });

  it("requires the current version token for executable definition changes", async () => {
    const db = updateDatabase();

    await expect(updateWorkflow(userId, workflowId, { definition }, db as never)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_REQUIRED", status: 409 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale definition save without inserting a version", async () => {
    const db = updateDatabase();

    await expect(updateWorkflow(userId, workflowId, { definition, expectedVersionId: nextVersionId }, db as never)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT", status: 409 });
    expect(db.tx.insert).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("allows metadata-only updates without a version token", async () => {
    const db = updateDatabase();

    await expect(updateWorkflow(userId, workflowId, { name: "Renamed" }, db as never)).resolves.toMatchObject({ currentVersion: 2 });
    expect(db.tx.insert).not.toHaveBeenCalled();
  });

  it("keeps resource validation active for disabled definition saves", async () => {
    const agentId = "77777777-7777-4777-8777-777777777777";
    const agentDefinition = {
      schemaVersion: 1 as const,
      entryStepId: "agent",
      steps: [{ id: "agent", type: "AGENT" as const, name: "Agent", config: { agentId, goal: { kind: "literal" as const, value: "draft" } } }],
    };
    vi.mocked(getAgent).mockRejectedValue(new AppError("AGENT_NOT_FOUND", 404, "Agent not found."));
    const db = updateDatabase();

    await expect(updateWorkflow(userId, workflowId, { definition: agentDefinition, expectedVersionId: versionId }, db as never)).rejects.toMatchObject({ code: "AGENT_NOT_FOUND", status: 404 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects layout metadata that does not cover the executable definition", async () => {
    const db = updateDatabase();
    const invalidLayout = { nodes: [{ id: "unknown", x: 0, y: 0 }], viewport: { x: 0, y: 0, zoom: 1 } };

    await expect(updateWorkflow(userId, workflowId, { layout: invalidLayout, expectedVersionId: versionId }, db as never)).rejects.toMatchObject({ code: "WORKFLOW_LAYOUT_INVALID", status: 400 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

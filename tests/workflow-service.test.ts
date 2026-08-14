import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { AppError } from "@/lib/security/errors";
import { workflowRuns, workflowVersions } from "@/lib/database/schema";
import { createWorkflow, createWorkflowRun, cancelWorkflowRun } from "@/lib/workflows/service";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn(), requireWorkspaceMember: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
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
  enabled: true,
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

function insertResult(rows: unknown[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

function updateResult(rows: unknown[]) {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) }) };
}

function database(options: { selectRows?: unknown[]; runRows?: unknown[] } = {}) {
  const selectRows = options.selectRows ?? [workflow];
  const runRows = options.runRows ?? [{ id: runId, workspaceId, workflowId, status: "RUNNING", startedBy: userId }];
  const selectLimit = vi.fn().mockResolvedValue(selectRows);
  const selectOrder = vi.fn().mockResolvedValue(selectRows);
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit, orderBy: selectOrder });
  const selectFrom = vi.fn().mockImplementation((table) => {
    if (table === workflowRuns) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(runRows) }) };
    if (table === workflowVersions) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([version]) }) };
    return { where: selectWhere };
  });
  const tx = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockImplementation((table) => {
      if (table === workflowRuns) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(runRows) }) };
      if (table === workflowVersions) return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([version]) }) };
      return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(selectRows) }) };
    }) }),
    insert: vi.fn()
      .mockReturnValueOnce(insertResult([workflow]))
      .mockReturnValueOnce(insertResult([version]))
      .mockReturnValueOnce(insertResult([{ id: runId, workspaceId, workflowId, status: "QUEUED" }]))
      .mockReturnValueOnce(insertResult([{ id: "dispatch-id", runId, status: "PENDING" }])),
    update: vi.fn().mockReturnValue(updateResult([workflow])),
  };
  return {
    select: vi.fn().mockReturnValue({ from: selectFrom }),
    insert: tx.insert,
    update: vi.fn().mockReturnValue(updateResult([workflow])),
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
}

describe("workflow service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId, role: "ADMIN" } as never);
    vi.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId, userId, role: "MEMBER" } as never);
    vi.mocked(getBrand).mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", workspaceId } as never);
  });

  it("creates version one and workflow metadata in one transaction", async () => {
    const db = database();

    await expect(createWorkflow(userId, { workspaceId, name: workflow.name, description: "", definition, enabled: true }, db as never)).resolves.toMatchObject({ id: workflowId, currentVersion: 1 });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow.created", resourceType: "workflow" }), expect.anything());
  });

  it("reuses an existing run for an authorized workspace idempotency key", async () => {
    const existingRun = { id: runId, workspaceId, workflowId, status: "QUEUED", idempotencyKey: "request-1" };
    const db = database({ runRows: [existingRun] });

    await expect(createWorkflowRun(userId, workflowId, { value: "input" }, "request-1", db as never)).resolves.toMatchObject({ id: runId });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("does not allow an ordinary member to cancel another member's run", async () => {
    vi.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId, userId, role: "MEMBER" } as never);
    const db = database({ runRows: [{ id: runId, workspaceId, workflowId, status: "RUNNING", startedBy: "user-b" }] });

    await expect(cancelWorkflowRun(userId, runId, db as never)).rejects.toMatchObject({ code: "WORKFLOW_CANCEL_FORBIDDEN", status: 403 });
  });

  it("preserves non-leaking cross-workspace behavior", async () => {
    vi.mocked(requireWorkspaceMember).mockRejectedValue(new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found."));
    const db = database();

    await expect(cancelWorkflowRun(userId, runId, db as never)).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND", status: 404 });
  });
});

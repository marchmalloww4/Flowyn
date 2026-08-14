import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  createWorkflowRun: vi.fn(),
  getWorkflowRun: vi.fn(),
  cancelWorkflowRun: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/workflows/service", () => ({
  createWorkflow: mocks.createWorkflow,
  listWorkflows: mocks.listWorkflows,
  getWorkflow: mocks.getWorkflow,
  updateWorkflow: mocks.updateWorkflow,
  deleteWorkflow: mocks.deleteWorkflow,
  createWorkflowRun: mocks.createWorkflowRun,
  getWorkflowRun: mocks.getWorkflowRun,
  cancelWorkflowRun: mocks.cancelWorkflowRun,
}));

import { GET as listGet, POST as createPost } from "@/app/api/workflows/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/workflows/[id]/route";
import { POST as runPost } from "@/app/api/workflows/[id]/runs/route";
import { GET as historyGet } from "@/app/api/workflow-runs/[id]/route";
import { POST as cancelPost } from "@/app/api/workflow-runs/[id]/cancel/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const definition = { schemaVersion: 1 as const, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "done" } } }] };
const workflow = { id: workflowId, workspaceId, name: "Campaign", description: "", enabled: true, currentVersion: 1 };
const context = { params: Promise.resolve({ id: workflowId }) };
const runContext = { params: Promise.resolve({ id: runId }) };

function request(url: string, method: string, body?: unknown, headers?: HeadersInit): Request {
  return new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json", ...headers } });
}

describe("workflow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.createWorkflow.mockResolvedValue(workflow);
    mocks.listWorkflows.mockResolvedValue([workflow]);
    mocks.getWorkflow.mockResolvedValue(workflow);
    mocks.updateWorkflow.mockResolvedValue({ ...workflow, currentVersion: 2 });
    mocks.deleteWorkflow.mockResolvedValue(undefined);
    mocks.createWorkflowRun.mockResolvedValue({ id: runId, status: "QUEUED", workflowId });
    mocks.getWorkflowRun.mockResolvedValue({ run: { id: runId, status: "COMPLETED", output: "done" }, steps: [] });
    mocks.cancelWorkflowRun.mockResolvedValue({ id: runId, status: "CANCEL_REQUESTED" });
  });

  it("lists and creates workflows through authenticated services", async () => {
    expect((await listGet(new Request(`http://localhost/api/workflows?workspaceId=${workspaceId}`))).status).toBe(200);
    expect(mocks.listWorkflows).toHaveBeenCalledWith("user-1", workspaceId);
    const response = await createPost(request("http://localhost/api/workflows", "POST", { workspaceId, name: "Campaign", definition }));
    expect(response.status).toBe(201);
    expect(mocks.createWorkflow).toHaveBeenCalledWith("user-1", expect.objectContaining({ workspaceId, definition, enabled: false }));
  });

  it("rejects unknown body fields and exposes versioned workflow updates", async () => {
    const invalid = await createPost(request("http://localhost/api/workflows", "POST", { workspaceId, name: "Campaign", definition, userId: "user-2" }));
    expect(invalid.status).toBe(400);
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
    const patch = await patchRoute(request("http://localhost/api/workflows/id", "PATCH", { definition }), context);
    expect(patch.status).toBe(200);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith("user-1", workflowId, { definition });
    expect((await getRoute(new Request("http://localhost/api/workflows/id"), context)).status).toBe(200);
    expect((await deleteRoute(new Request("http://localhost/api/workflows/id", { method: "DELETE" }), context)).status).toBe(204);
  });

  it("queues runs with a bounded idempotency header and returns 202", async () => {
    const response = await runPost(request("http://localhost/api/workflows/id/runs", "POST", { input: { campaign: "violet" } }, { "Idempotency-Key": "campaign-1" }), context);
    expect(response.status).toBe(202);
    expect(mocks.createWorkflowRun).toHaveBeenCalledWith("user-1", workflowId, { campaign: "violet" }, "campaign-1");
  });

  it("rejects malformed run bodies and preserves non-leaking service errors", async () => {
    const invalid = await runPost(request("http://localhost/api/workflows/id/runs", "POST", { input: { ok: true }, workspaceId }), context);
    expect(invalid.status).toBe(400);
    mocks.getWorkflowRun.mockRejectedValue(new AppError("WORKFLOW_NOT_FOUND", 404, "Workflow run not found."));
    expect((await historyGet(new Request("http://localhost/api/workflow-runs/id"), runContext)).status).toBe(404);
  });

  it("returns safe history and sends cancellation to the authorized service", async () => {
    expect((await historyGet(new Request("http://localhost/api/workflow-runs/id"), runContext)).status).toBe(200);
    const response = await cancelPost(new Request("http://localhost/api/workflow-runs/id/cancel", { method: "POST" }), runContext);
    expect(response.status).toBe(200);
    expect(mocks.cancelWorkflowRun).toHaveBeenCalledWith("user-1", runId);
  });

  it("does not call workflow services when unauthenticated", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Sign in is required."));
    expect((await listGet(new Request(`http://localhost/api/workflows?workspaceId=${workspaceId}`))).status).toBe(401);
    expect(mocks.listWorkflows).not.toHaveBeenCalled();
  });
});

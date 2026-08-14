import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listWorkflowApprovalRequests: vi.fn(),
  getWorkflowApprovalRequest: vi.fn(),
  decideWorkflowApproval: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/workflows/approval-service", () => ({
  listWorkflowApprovalRequests: mocks.listWorkflowApprovalRequests,
  getWorkflowApprovalRequest: mocks.getWorkflowApprovalRequest,
  decideWorkflowApproval: mocks.decideWorkflowApproval,
}));

import { GET as listGet } from "@/app/api/workflow-approvals/route";
import { GET as getRoute } from "@/app/api/workflow-approvals/[id]/route";
import { POST as approvePost } from "@/app/api/workflow-approvals/[id]/approve/route";
import { POST as rejectPost } from "@/app/api/workflow-approvals/[id]/reject/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const approval = { id: requestId, workspaceId, status: "PENDING", requiredRole: "ADMIN", safeContext: { origin: "manual" } };
const context = { params: Promise.resolve({ id: requestId }) };

function request(url: string, method: string, body: unknown = {}): Request {
  return new Request(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("workflow approval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.listWorkflowApprovalRequests.mockResolvedValue([approval]);
    mocks.getWorkflowApprovalRequest.mockResolvedValue(approval);
    mocks.decideWorkflowApproval.mockResolvedValue({ ...approval, status: "APPROVED" });
  });

  it("lists, reads, approves, and rejects only through authenticated service calls", async () => {
    expect((await listGet(new Request(`http://localhost/api/workflow-approvals?workspaceId=${workspaceId}`))).status).toBe(200);
    expect(mocks.listWorkflowApprovalRequests).toHaveBeenCalledWith("user-1", workspaceId);
    expect((await getRoute(new Request("http://localhost/api/workflow-approvals/id"), context)).status).toBe(200);
    expect((await approvePost(request("http://localhost/api/workflow-approvals/id/approve", "POST"), context)).status).toBe(200);
    expect(mocks.decideWorkflowApproval).toHaveBeenCalledWith("user-1", requestId, "approved", null);
    expect((await rejectPost(request("http://localhost/api/workflow-approvals/id/reject", "POST", { reason: "Not ready" }), context)).status).toBe(200);
    expect(mocks.decideWorkflowApproval).toHaveBeenCalledWith("user-1", requestId, "rejected", "Not ready");
  });

  it("rejects unbounded or identity-bearing decision bodies", async () => {
    const invalid = await approvePost(request("http://localhost/api/workflow-approvals/id/approve", "POST", { userId: "attacker", decision: "approved" }), context);
    expect(invalid.status).toBe(400);
    expect(mocks.decideWorkflowApproval).not.toHaveBeenCalled();
  });
});

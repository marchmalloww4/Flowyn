import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createWorkflowWebhook: vi.fn(),
  listWorkflowWebhooks: vi.fn(),
  getWorkflowWebhook: vi.fn(),
  updateWorkflowWebhook: vi.fn(),
  deleteWorkflowWebhook: vi.fn(),
  setWorkflowWebhookEnabled: vi.fn(),
  rotateWorkflowWebhookSecret: vi.fn(),
  listWorkflowWebhookEvents: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/webhooks/service", () => ({
  createWorkflowWebhook: mocks.createWorkflowWebhook,
  listWorkflowWebhooks: mocks.listWorkflowWebhooks,
  getWorkflowWebhook: mocks.getWorkflowWebhook,
  updateWorkflowWebhook: mocks.updateWorkflowWebhook,
  deleteWorkflowWebhook: mocks.deleteWorkflowWebhook,
  setWorkflowWebhookEnabled: mocks.setWorkflowWebhookEnabled,
  rotateWorkflowWebhookSecret: mocks.rotateWorkflowWebhookSecret,
  listWorkflowWebhookEvents: mocks.listWorkflowWebhookEvents,
}));

import { GET as listGet, POST as createPost } from "@/app/api/workflow-webhooks/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/workflow-webhooks/[id]/route";
import { POST as enablePost } from "@/app/api/workflow-webhooks/[id]/enable/route";
import { POST as disablePost } from "@/app/api/workflow-webhooks/[id]/disable/route";
import { POST as rotatePost } from "@/app/api/workflow-webhooks/[id]/rotate-secret/route";
import { GET as eventsGet } from "@/app/api/workflow-webhooks/[id]/events/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const triggerId = "33333333-3333-4333-8333-333333333333";
const webhook = { id: triggerId, workspaceId, workflowId, publicId: "public-id", name: "Inbound", enabled: true, secretVersion: 1 };
const context = { params: Promise.resolve({ id: triggerId }) };

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" } });
}

describe("workflow webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.createWorkflowWebhook.mockResolvedValue({ trigger: webhook, secret: "whsec_once" });
    mocks.listWorkflowWebhooks.mockResolvedValue([webhook]);
    mocks.getWorkflowWebhook.mockResolvedValue(webhook);
    mocks.updateWorkflowWebhook.mockResolvedValue({ ...webhook, name: "Updated" });
    mocks.deleteWorkflowWebhook.mockResolvedValue(undefined);
    mocks.setWorkflowWebhookEnabled.mockResolvedValue({ ...webhook, enabled: false });
    mocks.rotateWorkflowWebhookSecret.mockResolvedValue({ trigger: { ...webhook, secretVersion: 2 }, secret: "whsec_rotated" });
    mocks.listWorkflowWebhookEvents.mockResolvedValue([]);
  });

  it("lists, creates, updates, toggles, rotates, deletes, and reads history", async () => {
    expect((await listGet(new Request(`http://localhost/api/workflow-webhooks?workspaceId=${workspaceId}`))).status).toBe(200);
    expect(mocks.listWorkflowWebhooks).toHaveBeenCalledWith("user-1", workspaceId);
    expect((await createPost(request("http://localhost/api/workflow-webhooks", "POST", { workspaceId, workflowId, name: "Inbound" }))).status).toBe(201);
    expect((await getRoute(new Request("http://localhost/api/workflow-webhooks/id"), context)).status).toBe(200);
    expect((await patchRoute(request("http://localhost/api/workflow-webhooks/id", "PATCH", { name: "Updated" }), context)).status).toBe(200);
    expect((await enablePost(request("http://localhost/api/workflow-webhooks/id", "POST"), context)).status).toBe(200);
    expect((await disablePost(request("http://localhost/api/workflow-webhooks/id", "POST"), context)).status).toBe(200);
    expect((await rotatePost(request("http://localhost/api/workflow-webhooks/id", "POST"), context)).status).toBe(200);
    expect((await eventsGet(new Request("http://localhost/api/workflow-webhooks/id/events?limit=20"), context)).status).toBe(200);
    expect((await deleteRoute(request("http://localhost/api/workflow-webhooks/id", "DELETE"), context)).status).toBe(204);
  });

  it("rejects client identity fields and maps service errors", async () => {
    const invalid = await createPost(request("http://localhost/api/workflow-webhooks", "POST", { workspaceId, workflowId, name: "Inbound", userId: "user-2" }));
    expect(invalid.status).toBe(400);
    expect(mocks.createWorkflowWebhook).not.toHaveBeenCalled();
    mocks.getWorkflowWebhook.mockRejectedValue(new AppError("WORKFLOW_WEBHOOK_NOT_FOUND", 404, "Workflow webhook not found."));
    expect((await getRoute(new Request("http://localhost/api/workflow-webhooks/id"), context)).status).toBe(404);
  });
});

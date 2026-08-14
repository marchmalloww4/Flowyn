import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createAgent: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  runAgent: vi.fn(),
  getAgentRun: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/agents/service", () => ({
  createAgent: mocks.createAgent,
  listAgents: mocks.listAgents,
  getAgent: mocks.getAgent,
  updateAgent: mocks.updateAgent,
  deleteAgent: mocks.deleteAgent,
  getAgentRun: mocks.getAgentRun,
}));
vi.mock("@/lib/agents/runner", () => ({ runAgent: mocks.runAgent }));

import { GET as listAgentsGet, POST as createAgentPost } from "@/app/api/agents/route";
import { DELETE as deleteAgentRoute, GET as getAgentRoute, PATCH as patchAgentRoute } from "@/app/api/agents/[id]/route";
import { POST as runAgentPost } from "@/app/api/agents/[id]/runs/route";
import { GET as getRunRoute } from "@/app/api/agent-runs/[id]/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const agentId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const routeContext = { params: Promise.resolve({ id: agentId }) };
const runRouteContext = { params: Promise.resolve({ id: runId }) };

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("agent routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.listAgents.mockResolvedValue([]);
    mocks.createAgent.mockResolvedValue({ id: agentId, workspaceId, name: "Research", enabled: true, deletedAt: null });
    mocks.getAgent.mockResolvedValue({ id: agentId, workspaceId, name: "Research", enabled: true, deletedAt: null });
    mocks.updateAgent.mockResolvedValue({ id: agentId, workspaceId, name: "Updated", enabled: true, deletedAt: null });
    mocks.deleteAgent.mockResolvedValue(undefined);
    mocks.runAgent.mockResolvedValue({ status: "COMPLETED", stepCount: 1, finalResponse: "Done.", errorCode: undefined });
    mocks.getAgentRun.mockResolvedValue({
      run: { id: runId, workspaceId, status: "COMPLETED", stepCount: 1, finalResponse: "Done.", errorCode: null },
      steps: [{ id: "step-1", stepNumber: 1, type: "FINAL_RESPONSE", status: "SUCCEEDED", safeInputMetadata: {}, safeOutputMetadata: { finalResponseChars: 5 }, errorCode: null }],
    });
  });

  it("authenticates and lists agents for the requested workspace", async () => {
    const response = await listAgentsGet(new Request(`http://localhost/api/agents?workspaceId=${workspaceId}`));

    expect(response.status).toBe(200);
    expect(mocks.listAgents).toHaveBeenCalledWith("user-1", workspaceId);
  });

  it("rejects malformed create bodies and unexpected identity fields", async () => {
    const response = await createAgentPost(jsonRequest("http://localhost/api/agents", "POST", { workspaceId, name: "", userId: "user-2" }));
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("creates, reads, updates, and soft-deletes through authorized services", async () => {
    const createResponse = await createAgentPost(jsonRequest("http://localhost/api/agents", "POST", { workspaceId, name: "Research", allowedTools: [] }));
    expect(createResponse.status).toBe(201);
    expect(mocks.createAgent).toHaveBeenCalledWith("user-1", expect.objectContaining({ workspaceId, name: "Research" }));

    expect((await getAgentRoute(new Request(`http://localhost/api/agents/${agentId}`), routeContext)).status).toBe(200);
    expect(mocks.getAgent).toHaveBeenCalledWith("user-1", agentId);

    const patchResponse = await patchAgentRoute(jsonRequest(`http://localhost/api/agents/${agentId}`, "PATCH", { name: "Updated", workspaceId }), routeContext);
    expect(patchResponse.status).toBe(400);
    expect(mocks.updateAgent).not.toHaveBeenCalled();

    const validPatch = await patchAgentRoute(jsonRequest(`http://localhost/api/agents/${agentId}`, "PATCH", { name: "Updated" }), routeContext);
    expect(validPatch.status).toBe(200);
    expect(mocks.updateAgent).toHaveBeenCalledWith("user-1", agentId, { name: "Updated" });

    const deleteResponse = await deleteAgentRoute(new Request(`http://localhost/api/agents/${agentId}`, { method: "DELETE" }), routeContext);
    expect(deleteResponse.status).toBe(204);
    expect(mocks.deleteAgent).toHaveBeenCalledWith("user-1", agentId);
  });

  it("runs synchronously and derives all runtime identity from the route and session", async () => {
    const response = await runAgentPost(jsonRequest(`http://localhost/api/agents/${agentId}/runs`, "POST", { goal: "Find violet" }), routeContext);
    const body = await response.json() as { run: { status: string; finalResponse: string } };

    expect(response.status).toBe(200);
    expect(body.run.status).toBe("COMPLETED");
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", agentId, goal: "Find violet", abortSignal: expect.any(AbortSignal) }));
    expect(mocks.runAgent.mock.calls[0]?.[0]).not.toHaveProperty("workspaceId");
    expect(mocks.runAgent.mock.calls[0]?.[0]).not.toHaveProperty("brandId");
  });

  it("rejects client-supplied runtime identity and policy fields", async () => {
    const response = await runAgentPost(jsonRequest(`http://localhost/api/agents/${agentId}/runs`, "POST", { goal: "Find violet", workspaceId, brandId: "brand-b", userId: "user-2", agentId, allowedTools: ["shell"], maxSteps: 99 }), routeContext);

    expect(response.status).toBe(400);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("rejects a run body without a valid bounded goal", async () => {
    const response = await runAgentPost(jsonRequest(`http://localhost/api/agents/${agentId}/runs`, "POST", { goal: "", workspaceId }), routeContext);

    expect(response.status).toBe(400);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });

  it("returns safe ordered run history", async () => {
    const response = await getRunRoute(new Request(`http://localhost/api/agent-runs/${runId}`), runRouteContext);
    const body = await response.json() as { run: { status: string }; steps: Array<{ safeOutputMetadata: Record<string, unknown>; modelObservation?: unknown }> };

    expect(response.status).toBe(200);
    expect(body.run.status).toBe("COMPLETED");
    expect(body.steps[0]?.safeOutputMetadata).toEqual({ finalResponseChars: 5 });
    expect(body.steps[0]).not.toHaveProperty("modelObservation");
    expect(mocks.getAgentRun).toHaveBeenCalledWith("user-1", runId);
  });

  it("does not leak missing or cross-workspace run details", async () => {
    mocks.getAgentRun.mockRejectedValue(new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found."));

    const response = await getRunRoute(new Request(`http://localhost/api/agent-runs/${runId}`), runRouteContext);
    const body = await response.json() as { error: { status?: string; message: string } };

    expect(response.status).toBe(404);
    expect(body.error.message).toBe("Resource not found.");
  });

  it("returns unauthenticated responses without calling agent services", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Sign in is required."));

    const response = await listAgentsGet(new Request(`http://localhost/api/agents?workspaceId=${workspaceId}`));

    expect(response.status).toBe(401);
    expect(mocks.listAgents).not.toHaveBeenCalled();
  });
});

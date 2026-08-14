import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), runAgent: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/agents/runner", () => ({ runAgent: mocks.runAgent }));

import { POST } from "@/app/api/agents/[id]/runs/route";

describe("agent run route admission identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-a" });
    mocks.runAgent.mockResolvedValue({ runId: "run-a", status: "COMPLETED", stepCount: 1, finalResponse: "done", errorCode: null });
  });

  it("passes a validated idempotency identity and correlation ID to AgentRunner", async () => {
    const response = await POST(new Request("http://localhost/api/agents/agent-a/runs", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1", "X-Request-ID": "corr-1" }, body: JSON.stringify({ goal: "answer" }) }), { params: Promise.resolve({ id: "agent-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-a", agentId: "agent-a", usage: { operationKey: "agent-start:request-1", sourceType: "AGENT_RUN", sourceId: "request-1", correlationId: "corr-1" } }));
  });
});

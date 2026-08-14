import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), usage: vi.fn(), operations: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/workspaces/operations", () => ({ getWorkspaceUsageSummary: mocks.usage, getWorkspaceOperationsSummary: mocks.operations }));

import { GET as getUsage } from "@/app/api/workspaces/[id]/usage/route";
import { GET as getOperations } from "@/app/api/workspaces/[id]/operations/route";

describe("workspace operations routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-a" });
    mocks.usage.mockResolvedValue({ workspaceId: "workspace-a", limits: {}, counters: {} });
    mocks.operations.mockResolvedValue({ workspaceId: "workspace-a", workflowRuns: {}, agentRuns: {}, integrationActions: {}, deferredDispatches: 0 });
  });

  it("returns a server-authorized usage projection", async () => {
    const response = await getUsage(new Request("http://localhost/api/workspaces/workspace-a/usage"), { params: Promise.resolve({ id: "workspace-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.usage).toHaveBeenCalledWith("user-a", "workspace-a");
  });

  it("passes bounded operation query parameters to the server projection", async () => {
    const response = await getOperations(new Request("http://localhost/api/workspaces/workspace-a/operations?limit=20&from=2026-08-01T00:00:00.000Z&to=2026-08-15T00:00:00.000Z"), { params: Promise.resolve({ id: "workspace-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.operations).toHaveBeenCalledWith("user-a", "workspace-a", expect.objectContaining({ limit: 20, from: expect.any(Date), to: expect.any(Date) }));
  });
});

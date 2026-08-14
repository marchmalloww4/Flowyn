import { describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  consumeWorkspaceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  admitWorkspaceUsage: vi.fn().mockResolvedValue({ admitted: true, duplicate: false, limit: 500 }),
  getWorkspaceUsagePolicy: vi.fn().mockReturnValue({
    plan: "SELF_HOSTED",
    workspaceId: "workspace-a",
    limits: {
      aiGenerationsPerMinute: 30,
      aiGenerationsPerDay: 500,
      agentRunsPerDay: 120,
      workflowStartsPerMinute: 60,
      workflowStartsPerDay: 1000,
      integrationActionsPerMinute: 30,
      integrationActionsPerDay: 300,
    },
  }),
  getUsageRateLimitRedis: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/usage/admission", () => ({
  admitWorkspaceUsage: dependencies.admitWorkspaceUsage,
  dayBucketStart: (now: Date) => now,
  minuteBucketStart: (now: Date) => now,
}));
vi.mock("@/lib/usage/policy", () => ({ getWorkspaceUsagePolicy: dependencies.getWorkspaceUsagePolicy }));
vi.mock("@/lib/usage/rate-limit", () => ({ consumeWorkspaceRateLimit: dependencies.consumeWorkspaceRateLimit }));
vi.mock("@/lib/usage/redis", () => ({ getUsageRateLimitRedis: dependencies.getUsageRateLimitRedis }));

import { admitAgentDecision, admitAgentRun, admitAiGeneration, admitIntegrationAction, admitWorkflowStart } from "@/lib/usage/service";

describe("workspace operation usage admission", () => {
  it("applies the AI minute rate limit and durable daily quota", async () => {
    await admitAiGeneration({ workspaceId: "workspace-a", operationKey: "direct-ai:req-1", sourceType: "DIRECT_AI", sourceId: "req-1" });

    expect(dependencies.consumeWorkspaceRateLimit).toHaveBeenCalledWith("workspace-a", "AI", expect.objectContaining({ limit: 30, redis: expect.anything() }));
    expect(dependencies.admitWorkspaceUsage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      metric: "AI_GENERATION_DAY",
      operationKey: "direct-ai:req-1",
      sourceType: "DIRECT_AI",
      limit: 500,
    }));
  });

  it("uses stable operation keys for agent decisions and workflow starts", async () => {
    await admitAgentRun({ workspaceId: "workspace-a", operationKey: "agent-start:run-1", sourceType: "AGENT_RUN", sourceId: "run-1" });
    await admitAgentDecision({ workspaceId: "workspace-a", operationKey: "agent-ai:run-1:1", sourceType: "AGENT_DECISION", sourceId: "run-1" });
    await admitWorkflowStart({ workspaceId: "workspace-a", operationKey: "workflow-start:run-1", sourceType: "WORKFLOW_RUN", sourceId: "run-1" });
    await admitIntegrationAction({ workspaceId: "workspace-a", operationKey: "integration:action-1", sourceType: "INTEGRATION_ACTION", sourceId: "action-1" });

    expect(dependencies.admitWorkspaceUsage).toHaveBeenCalledWith(expect.objectContaining({ metric: "AGENT_RUN_DAY", limit: 120 }));
    expect(dependencies.admitWorkspaceUsage).toHaveBeenCalledWith(expect.objectContaining({ metric: "AI_GENERATION_DAY", operationKey: "agent-ai:run-1:1", limit: 500 }));
    expect(dependencies.consumeWorkspaceRateLimit).toHaveBeenCalledWith("workspace-a", "WORKFLOW", expect.objectContaining({ limit: 60 }));
    expect(dependencies.admitWorkspaceUsage).toHaveBeenCalledWith(expect.objectContaining({ metric: "INTEGRATION_ACTION_DAY", limit: 300 }));
  });

  it("fails closed when the short-window limiter rejects an operation", async () => {
    dependencies.consumeWorkspaceRateLimit.mockResolvedValueOnce({ allowed: false });

    await expect(admitAiGeneration({ workspaceId: "workspace-a", operationKey: "direct-ai:req-2", sourceType: "DIRECT_AI" })).rejects.toMatchObject({ code: "WORKSPACE_RATE_LIMIT_EXCEEDED", status: 429 });
    expect(dependencies.admitWorkspaceUsage).not.toHaveBeenCalledWith(expect.objectContaining({ operationKey: "direct-ai:req-2" }));
  });
});

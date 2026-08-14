import { describe, expect, it } from "vitest";
import { resolveWorkspacePlan } from "@/lib/usage/resolver";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";

describe("workspace usage policy", () => {
  it("resolves every workspace to the static SELF_HOSTED plan", () => {
    expect(resolveWorkspacePlan("11111111-1111-4111-8111-111111111111")).toBe("SELF_HOSTED");
  });

  it("centralizes the approved SELF_HOSTED operational limits", () => {
    const policy = getWorkspaceUsagePolicy("11111111-1111-4111-8111-111111111111");

    expect(policy).toMatchObject({
      plan: "SELF_HOSTED",
      limits: {
        aiGenerationsPerMinute: 30,
        aiGenerationsPerDay: 500,
        concurrentAgents: 2,
        agentRunsPerDay: 120,
        concurrentWorkflows: 10,
        workflowStartsPerMinute: 60,
        workflowStartsPerDay: 1000,
        acceptedWebhooksPerMinute: 300,
        activeSchedules: 50,
        knowledgeDocuments: 100,
        knowledgeCharacters: 10_000_000,
        integrationCredentials: 20,
        concurrentIntegrationActions: 2,
        integrationActionsPerMinute: 30,
        integrationActionsPerDay: 300,
      },
    });
  });
});

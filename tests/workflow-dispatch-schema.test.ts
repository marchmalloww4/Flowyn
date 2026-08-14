import { describe, expect, it } from "vitest";
import { agentRuns, generationLogs, integrationActionRuns, workflowRunDispatches, workflowRuns } from "@/lib/database/schema";

describe("Milestone 12 operational schema extensions", () => {
  it("keeps the existing dispatch states and adds bounded deferral fields", () => {
    expect(Object.keys(workflowRunDispatches)).toEqual(expect.arrayContaining([
      "status", "attempts", "dispatchGeneration", "nextAttemptAt", "deferCount", "deferReason", "correlationId",
    ]));
  });

  it("adds nullable correlation fields to operational roots", () => {
    expect(workflowRuns.correlationId).toBeDefined();
    expect(agentRuns.correlationId).toBeDefined();
    expect(generationLogs.correlationId).toBeDefined();
    expect(integrationActionRuns.correlationId).toBeDefined();
  });
});

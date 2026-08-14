import { describe, expect, it } from "vitest";
import { workflowAiOperationKey, workflowStartOperationKey } from "@/lib/usage/policy";

describe("quota retry identity", () => {
  it("reuses workflow start identity across BullMQ and stale-worker retries", () => {
    expect(workflowStartOperationKey("run-1")).toBe(workflowStartOperationKey("run-1"));
  });

  it("reuses a workflow AI logical step identity across step attempts", () => {
    expect(workflowAiOperationKey("run-1", "ai-step")).toBe("workflow-ai:run-1:ai-step");
  });
});

import { describe, expect, it } from "vitest";
import { buildWorkflowApprovalSafeContext, canDecideWorkflowApproval } from "@/lib/workflows/approvals";

describe("workflow approval policy and safe context", () => {
  it("requires the current human role to satisfy the immutable approval policy", () => {
    expect(canDecideWorkflowApproval("ADMIN", "ADMIN")).toBe(true);
    expect(canDecideWorkflowApproval("ADMIN", "OWNER")).toBe(true);
    expect(canDecideWorkflowApproval("ADMIN", "MEMBER")).toBe(false);
    expect(canDecideWorkflowApproval("OWNER", "ADMIN")).toBe(false);
    expect(canDecideWorkflowApproval("OWNER", "OWNER")).toBe(true);
  });

  it("builds bounded context without copying untrusted workflow data", () => {
    const context = buildWorkflowApprovalSafeContext({
      workflowName: "Publish workflow",
      workflowStepName: "Manager approval",
      runId: "run-1",
      workflowVersion: 4,
      requiredRole: "ADMIN",
      origin: "webhook",
      completedStepCount: 2,
      completedStepTypes: ["SET_VALUE", "AI_GENERATE", "UNTRUSTED_TOOL_OUTPUT"],
    });

    expect(context).toEqual({
      workflowName: "Publish workflow",
      workflowStepName: "Manager approval",
      runId: "run-1",
      workflowVersion: 4,
      requiredRole: "ADMIN",
      origin: "webhook",
      completedStepCount: 2,
      completedStepTypes: ["SET_VALUE", "AI_GENERATE"],
    });
    expect(JSON.stringify(context)).not.toContain("UNTRUSTED_TOOL_OUTPUT");
    expect(JSON.stringify(context)).not.toContain("prompt");
    expect(JSON.stringify(context)).not.toContain("secret");
  });
});

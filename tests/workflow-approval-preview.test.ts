import { describe, expect, it } from "vitest";
import { buildWorkflowApprovalSafeContext, resolveApprovalReview } from "@/lib/workflows/approvals";

describe("workflow approval previews", () => {
  it("stores only a bounded review string in safe context", () => {
    const safe = buildWorkflowApprovalSafeContext({ workflowName: "Flow", workflowStepName: "Review", runId: "run", workflowVersion: 1, requiredRole: "ADMIN", origin: "manual", completedStepCount: 1, completedStepTypes: ["SET_VALUE"], review: "Send the approved message" });
    expect(safe.review).toBe("Send the approved message");
    expect(JSON.stringify(safe)).not.toContain("secret");
  });

  it("resolves only string bounded review expressions", () => {
    const context = { trigger: {}, steps: { prepare: { output: { text: "Hello" } } } } as never;
    expect(resolveApprovalReview({ kind: "reference", path: "steps.prepare.output.text" }, context)).toBe("Hello");
    expect(() => resolveApprovalReview({ kind: "literal", value: 42 }, context)).toThrow();
    expect(() => resolveApprovalReview({ kind: "literal", value: "x".repeat(2001) }, context)).toThrow();
  });
});

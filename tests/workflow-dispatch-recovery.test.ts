import { describe, expect, it } from "vitest";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";

describe("workflow dispatch recovery bounds", () => {
  it("keeps dispatch lease and retry bounds finite", () => {
    const policy = getWorkflowExecutionPolicy();
    expect(policy.dispatchLeaseMs).toBeGreaterThan(0);
    expect(policy.maxRetries).toBeLessThanOrEqual(5);
  });
});

import { describe, expect, it } from "vitest";
import { createDefaultWorkflowStepRegistry, WorkflowStepRegistry } from "@/lib/workflows/registry";

describe("workflow step registry", () => {
  it("registers the deterministic built-ins statically", () => {
    const registry = createDefaultWorkflowStepRegistry();
    expect(registry.get("SET_VALUE").type).toBe("SET_VALUE");
    expect(registry.get("TRANSFORM").type).toBe("TRANSFORM");
    expect(registry.get("CONDITION").type).toBe("CONDITION");
  });

  it("rejects duplicate and unknown registrations", () => {
    const registry = new WorkflowStepRegistry();
    const executor = { type: "SET_VALUE" as const, configSchema: {} as never, execute: async () => ({ output: null, nextStepId: null, safeMetadata: {} }) };
    registry.register(executor);
    expect(() => registry.register(executor)).toThrowError(/already registered/);
    expect(() => registry.get("TRANSFORM")).toThrowError(/not registered/);
  });
});

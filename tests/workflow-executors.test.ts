import { describe, expect, it } from "vitest";
import { createDefaultWorkflowStepRegistry } from "@/lib/workflows/registry";
import { sanitizeWorkflowValue } from "@/lib/workflows/context";
import type { WorkflowStepExecutionContext } from "@/lib/workflows/types";

function context(input: unknown = { name: "Ada", profile: { city: "Kuala Lumpur" }, values: [2, 4] }, outputs: Record<string, unknown> = {}) {
  return {
    runId: "run",
    workspaceId: "workspace",
    actorUserId: "user",
    workflowId: "workflow",
    workflowVersion: 1,
    triggerInput: sanitizeWorkflowValue(input),
    stepOutputs: Object.fromEntries(Object.entries(outputs).map(([id, output]) => [id, sanitizeWorkflowValue(output)])),
    abortSignal: new AbortController().signal,
    db: {} as never,
  } satisfies WorkflowStepExecutionContext;
}

describe("workflow deterministic executors", () => {
  const registry = createDefaultWorkflowStepRegistry();

  it("resolves literal and trigger reference values", async () => {
    const executor = registry.get("SET_VALUE");
    await expect(executor.execute(context(), { value: { kind: "literal", value: "hello" } })).resolves.toMatchObject({ output: "hello", safeMetadata: { operation: "SET_VALUE" } });
    await expect(executor.execute(context(), { value: { kind: "reference", path: "trigger.name" } })).resolves.toMatchObject({ output: "Ada" });
  });

  it("supports bounded transform operations", async () => {
    const executor = registry.get("TRANSFORM");
    await expect(executor.execute(context(), { operation: "select", source: { kind: "reference", path: "trigger.profile" }, path: "city" })).resolves.toMatchObject({ output: "Kuala Lumpur" });
    await expect(executor.execute(context(), { operation: "lowercase", source: { kind: "literal", value: "FLOWYN" } })).resolves.toMatchObject({ output: "flowyn" });
    await expect(executor.execute(context(), { operation: "uppercase", source: { kind: "literal", value: "flowyn" } })).resolves.toMatchObject({ output: "FLOWYN" });
    await expect(executor.execute(context(), { operation: "concat", parts: [{ kind: "literal", value: "Flow" }, { kind: "literal", value: "yn" }] })).resolves.toMatchObject({ output: "Flowyn" });
    await expect(executor.execute(context(), { operation: "object", fields: { greeting: { kind: "literal", value: "hello" }, name: { kind: "reference", path: "trigger.name" } } })).resolves.toMatchObject({ output: { greeting: "hello", name: "Ada" } });
  });

  it("evaluates condition operators and selects a validated edge", async () => {
    const executor = registry.get("CONDITION");
    await expect(executor.execute(context(), { left: { kind: "literal", value: 3 }, operator: "greater_than", right: { kind: "literal", value: 2 }, onTrueStepId: "yes", onFalseStepId: "no" })).resolves.toMatchObject({ output: true, nextStepId: "yes" });
    await expect(executor.execute(context(), { left: { kind: "reference", path: "trigger.missing" }, operator: "exists", onTrueStepId: "yes", onFalseStepId: "no" })).resolves.toMatchObject({ output: false, nextStepId: "no" });
  });

  it("rejects unsafe or unbounded executor values", async () => {
    const executor = registry.get("TRANSFORM");
    await expect(executor.execute(context(), { operation: "lowercase", source: { kind: "literal", value: 4 } })).rejects.toThrow(/string/);
    await expect(executor.execute(context(), { operation: "select", source: { kind: "literal", value: { safe: "yes" } }, path: "__proto__" })).rejects.toThrow(/unsafe/);
  });
});

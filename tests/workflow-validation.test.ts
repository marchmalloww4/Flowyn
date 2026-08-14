import { describe, expect, it } from "vitest";
import { workflowDefinitionSchema, validateWorkflowDefinition } from "@/lib/workflows/validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("workflow definition validation", () => {
  it("accepts the supported strict step configurations", () => {
    const definition = {
      schemaVersion: 1,
      entryStepId: "set",
      steps: [
        { id: "set", type: "SET_VALUE", name: "Set", config: { value: { kind: "literal", value: "violet" } }, nextStepId: "transform" },
        { id: "transform", type: "TRANSFORM", name: "Transform", config: { operation: "uppercase", source: { kind: "reference", path: "steps.set.output" } }, nextStepId: "condition" },
        { id: "condition", type: "CONDITION", name: "Condition", config: { left: { kind: "reference", path: "steps.transform.output" }, operator: "equals", right: { kind: "literal", value: "VIOLET" }, onTrueStepId: "generate", onFalseStepId: "agent" } },
        { id: "generate", type: "AI_GENERATE", name: "Generate", config: { prompt: { kind: "reference", path: "steps.transform.output" }, maxTokens: 100 }, nextStepId: "agent" },
        { id: "agent", type: "AGENT", name: "Agent", config: { agentId: uuid, goal: { kind: "literal", value: "summarize" } } },
      ],
    };

    expect(validateWorkflowDefinition(definition)).toEqual(definition);
  });

  it("rejects unknown keys and unsupported step types", () => {
    const result = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      entryStepId: "step",
      steps: [{ id: "step", type: "SHELL", name: "Unsafe", config: {}, unexpected: true }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unbounded literal values", () => {
    const result = workflowDefinitionSchema.safeParse({
      schemaVersion: 1,
      entryStepId: "step",
      steps: [{ id: "step", type: "SET_VALUE", name: "Set", config: { value: { kind: "literal", value: { nested: { deeply: { unsafe: { value: "x" } } } } } } }],
    });

    expect(result.success).toBe(false);
  });
});

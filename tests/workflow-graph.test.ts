import { describe, expect, it } from "vitest";
import { validateWorkflowDefinition } from "@/lib/workflows/validation";

const literal = (value: unknown) => ({ kind: "literal", value });

function definition(steps: unknown[], entryStepId = "a") {
  return validateWorkflowDefinition({ schemaVersion: 1, entryStepId, steps });
}

describe("workflow graph validation", () => {
  it("rejects duplicate step IDs", () => {
    expect(() => definition([
      { id: "a", type: "SET_VALUE", name: "A", config: { value: literal("a") } },
      { id: "a", type: "SET_VALUE", name: "A2", config: { value: literal("a") } },
    ])).toThrow("duplicate");
  });

  it("rejects missing edge targets", () => {
    expect(() => definition([{ id: "a", type: "SET_VALUE", name: "A", config: { value: literal("a") }, nextStepId: "missing" }])).toThrow("reference");
  });

  it("rejects unreachable steps", () => {
    expect(() => definition([
      { id: "a", type: "SET_VALUE", name: "A", config: { value: literal("a") } },
      { id: "unreachable", type: "SET_VALUE", name: "U", config: { value: literal("u") } },
    ])).toThrow("unreachable");
  });

  it("rejects cycles", () => {
    expect(() => definition([
      { id: "a", type: "SET_VALUE", name: "A", config: { value: literal("a") }, nextStepId: "b" },
      { id: "b", type: "SET_VALUE", name: "B", config: { value: literal("b") }, nextStepId: "a" },
    ])).toThrow("cycle");
  });

  it("accepts a condition with two reachable branches", () => {
    expect(definition([
      { id: "a", type: "CONDITION", name: "Choose", config: { left: literal(true), operator: "equals", right: literal(true), onTrueStepId: "yes", onFalseStepId: "no" } },
      { id: "yes", type: "SET_VALUE", name: "Yes", config: { value: literal("yes") } },
      { id: "no", type: "SET_VALUE", name: "No", config: { value: literal("no") } },
    ]).entryStepId).toBe("a");
  });

  it("rejects references to non-ancestor steps", () => {
    expect(() => definition([
      { id: "a", type: "SET_VALUE", name: "A", config: { value: { kind: "reference", path: "steps.b.output" } }, nextStepId: "b" },
      { id: "b", type: "SET_VALUE", name: "B", config: { value: literal("b") } },
    ])).toThrow("ancestor");
  });
});

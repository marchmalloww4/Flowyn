import { describe, expect, it } from "vitest";
import { applyWorkflowEditorLayout, createDefaultWorkflowLayout, deserializeWorkflowDefinition, serializeWorkflowEditorState } from "@/lib/workflows/editor";
import type { WorkflowDefinition } from "@/lib/workflows/types";

const agentId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";

const definition: WorkflowDefinition = {
  schemaVersion: 1,
  entryStepId: "start",
  steps: [
    { id: "start", type: "SET_VALUE", name: "Start", config: { value: { kind: "literal", value: "hello" } }, nextStepId: "transform" },
    { id: "transform", type: "TRANSFORM", name: "Uppercase", config: { operation: "uppercase", source: { kind: "reference", path: "steps.start.output" } }, nextStepId: "condition" },
    { id: "condition", type: "CONDITION", name: "Branch", config: { left: { kind: "reference", path: "steps.transform.output" }, operator: "exists", onTrueStepId: "generate", onFalseStepId: "agent" } },
    { id: "generate", type: "AI_GENERATE", name: "Generate", config: { prompt: { kind: "reference", path: "steps.transform.output" }, brandId, useBrandContext: true }, nextStepId: "approval" },
    { id: "agent", type: "AGENT", name: "Agent", config: { agentId, goal: { kind: "literal", value: "summarize" } }, nextStepId: "approval" },
    { id: "approval", type: "APPROVAL", name: "Approve", config: { requiredRole: "ADMIN", expiresAfterSeconds: 300 } },
  ],
};

describe("workflow definition and visual editor projection", () => {
  it("supports every registered executable step type and round-trips without semantic change", () => {
    const state = deserializeWorkflowDefinition(definition);

    expect(state.nodes.map((node) => node.type)).toEqual([
      "SET_VALUE",
      "TRANSFORM",
      "CONDITION",
      "AI_GENERATE",
      "AGENT",
      "APPROVAL",
    ]);
    expect(state.edges).toEqual([
      { id: "start:next:transform", source: "start", target: "transform", kind: "next" },
      { id: "transform:next:condition", source: "transform", target: "condition", kind: "next" },
      { id: "condition:true:generate", source: "condition", target: "generate", kind: "true" },
      { id: "condition:false:agent", source: "condition", target: "agent", kind: "false" },
      { id: "generate:next:approval", source: "generate", target: "approval", kind: "next" },
      { id: "agent:next:approval", source: "agent", target: "approval", kind: "next" },
    ]);
    expect(serializeWorkflowEditorState(state)).toEqual(definition);
  });

  it("serializes the same editor state deterministically", () => {
    const state = deserializeWorkflowDefinition(definition);
    expect(JSON.stringify(serializeWorkflowEditorState(state))).toBe(JSON.stringify(serializeWorkflowEditorState(state)));
  });

  it("derives a deterministic layout without changing executable data", () => {
    const state = deserializeWorkflowDefinition(definition);
    const first = createDefaultWorkflowLayout(definition);
    const second = createDefaultWorkflowLayout(definition);

    expect(first).toEqual(second);
    expect(first.nodes.map((node) => node.id)).toEqual(state.nodes.map((node) => node.id));
    expect(JSON.stringify(first)).not.toContain("agentId");
    expect(JSON.stringify(first)).not.toContain("brandId");
    expect(serializeWorkflowEditorState({ ...state, layout: first })).toEqual(definition);
  });

  it("applies persisted positions without changing executable state", () => {
    const state = deserializeWorkflowDefinition(definition);
    const positioned = applyWorkflowEditorLayout(state, { nodes: [{ id: "start", x: 420, y: 180 }, ...state.layout.nodes.slice(1)], viewport: { x: 10, y: 20, zoom: 1.2 } });

    expect(positioned.nodes[0]?.position).toEqual({ x: 420, y: 180 });
    expect(positioned.layout.viewport).toEqual({ x: 10, y: 20, zoom: 1.2 });
    expect(serializeWorkflowEditorState(positioned)).toEqual(definition);
  });

  it("rejects unsupported nodes and invalid editor edges before a save", () => {
    const state = deserializeWorkflowDefinition(definition);

    expect(() => serializeWorkflowEditorState({
      ...state,
      nodes: [...state.nodes, { id: "unsafe", type: "SHELL" as never, name: "Unsafe", config: {} as never, position: { x: 0, y: 0 } }],
    })).toThrow();
    expect(() => serializeWorkflowEditorState({
      ...state,
      edges: [...state.edges, { id: "approval->start", source: "approval", target: "start", kind: "next" }],
    })).toThrow();
  });
});

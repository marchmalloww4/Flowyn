import { describe, expect, it } from "vitest";
import { agentDecisionSchema } from "@/lib/agents/decisions";

describe("agent decisions", () => {
  it("accepts a final decision", () => {
    expect(agentDecisionSchema.parse({ type: "final", final: "The answer is violet." })).toEqual({ type: "final", final: "The answer is violet." });
  });

  it("accepts a tool decision with model-controlled task arguments only", () => {
    expect(agentDecisionSchema.parse({ type: "tool", tool: { name: "search_brand_knowledge", arguments: { query: "campaign color", topK: 3 } } })).toMatchObject({ type: "tool", tool: { name: "search_brand_knowledge" } });
  });

  it("rejects reasoning fields, unknown keys, and partial tool decisions", () => {
    expect(agentDecisionSchema.safeParse({ type: "final", final: "answer", reasoning: "private thought" }).success).toBe(false);
    expect(agentDecisionSchema.safeParse({ type: "tool", tool: { name: "search_brand_knowledge" } }).success).toBe(false);
    expect(agentDecisionSchema.safeParse({ type: "tool", tool: { name: "", arguments: {} } }).success).toBe(false);
  });
});

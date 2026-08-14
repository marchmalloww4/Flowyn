import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/types";
import { ToolRegistry } from "@/lib/agents/registry";

const agentService = vi.hoisted(() => ({
  startAgentRun: vi.fn(),
  recordAgentRunStep: vi.fn().mockResolvedValue(undefined),
  completeAgentRun: vi.fn(),
  failAgentRun: vi.fn().mockResolvedValue(undefined),
}));
const usageService = vi.hoisted(() => ({ admitAgentDecision: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/agents/service", () => agentService);
vi.mock("@/lib/usage/service", () => usageService);

import { runAgent } from "@/lib/agents/runner";

const policy = { maxSteps: 3, hardMaxSteps: 12, totalTimeoutMs: 1000, modelTimeoutMs: 200, toolTimeoutMs: 200, maxGoalChars: 4000, maxObservationChars: 120, maxFinalResponseChars: 20 };
const agent = { id: "agent-a", workspaceId: "workspace-a", brandId: null, name: "Agent", description: "", systemInstructions: "", allowedTools: ["test_tool"], enabled: true, maxSteps: 3, deletedAt: null };
const run = { id: "run-a", workspaceId: "workspace-a", agentId: "agent-a", agentName: "Agent" };

function provider(): LLMProvider {
  return { generate: vi.fn(), generateStructured: vi.fn().mockResolvedValue({ value: { type: "final", final: "done" }, text: "", model: "test", done: true, durationMs: 1 }), stream: vi.fn(), health: vi.fn() };
}

describe("AgentRunner usage admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentService.startAgentRun.mockResolvedValue({ agent, run, policy });
    agentService.completeAgentRun.mockImplementation(async (_runId: string, result: unknown) => ({ ...run, ...(result as Record<string, unknown>) }));
  });

  it("admits each logical agent decision once using the stable run and step key", async () => {
    await runAgent({ userId: "user-a", agentId: "agent-a", goal: "answer", provider: provider(), registry: new ToolRegistry(), usage: { operationKey: "agent-start:req-1", sourceType: "AGENT_RUN", sourceId: "req-1" } });

    expect(usageService.admitAgentDecision).toHaveBeenCalledTimes(1);
    expect(usageService.admitAgentDecision).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", operationKey: "agent-ai:run-a:1", sourceType: "AGENT_DECISION", sourceId: "run-a" }));
  });

  it("does not admit a correction attempt twice for the same logical step", async () => {
    const model = provider();
    vi.mocked(model.generateStructured)
      .mockResolvedValueOnce({ value: { type: "tool", tool: { name: "test_tool", arguments: {} } }, text: "", model: "test", done: true, durationMs: 1 })
      .mockResolvedValueOnce({ value: { type: "final", final: "done" }, text: "", model: "test", done: true, durationMs: 1 });
    const registry = new ToolRegistry();
    registry.register({ name: "test_tool", description: "test", inputSchema: z.object({ query: z.string() }), inputDescription: "", requiresBrand: false, execute: vi.fn(), serializeObservation: () => "" });

    await runAgent({ userId: "user-a", agentId: "agent-a", goal: "answer", provider: model, registry, usage: { operationKey: "agent-start:req-2", sourceType: "AGENT_RUN", sourceId: "req-2" } });
    expect(usageService.admitAgentDecision).toHaveBeenCalledTimes(1);
  });
});

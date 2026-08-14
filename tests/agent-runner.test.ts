import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LLMProvider } from "@/lib/ai/types";
import { ToolRegistry, type AgentTool } from "@/lib/agents/registry";

const service = vi.hoisted(() => ({
  startAgentRun: vi.fn(),
  recordAgentRunStep: vi.fn().mockResolvedValue(undefined),
  completeAgentRun: vi.fn(),
  failAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/service", () => service);

import { runAgent } from "@/lib/agents/runner";

const policy = {
  maxSteps: 3,
  hardMaxSteps: 12,
  totalTimeoutMs: 1000,
  modelTimeoutMs: 200,
  toolTimeoutMs: 200,
  maxGoalChars: 4000,
  maxObservationChars: 120,
  maxFinalResponseChars: 20,
};

const agent = {
  id: "agent-a",
  workspaceId: "workspace-a",
  brandId: "brand-a",
  name: "Research agent",
  description: "Finds facts",
  systemInstructions: "Use the allowed tools.",
  allowedTools: ["test_tool"],
  enabled: true,
  maxSteps: 3,
  deletedAt: null,
};

const run = { id: "run-a", workspaceId: "workspace-a", agentId: "agent-a", agentName: "Research agent" };

type TestProvider = LLMProvider & { generateStructured: ReturnType<typeof vi.fn> };

function provider(): TestProvider {
  return { generate: vi.fn(), generateStructured: vi.fn(), stream: vi.fn(), health: vi.fn() } as TestProvider;
}

function tool(): AgentTool<{ query: string }, { text: string }> {
  return {
    name: "test_tool",
    description: "Returns a fact",
    inputSchema: z.object({ query: z.string().min(1) }).strict(),
    inputDescription: '{"query":"string"}',
    requiresBrand: true,
    execute: vi.fn().mockResolvedValue({ modelObservation: { text: "The fact is violet." }, safeSummary: { metadata: { resultCount: 1 }, durationMs: 2, characterCount: 28 } }),
    serializeObservation: (output) => JSON.stringify(output),
  };
}

describe("AgentRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.startAgentRun.mockResolvedValue({ agent, run, policy });
    service.completeAgentRun.mockImplementation(async (_runId: string, result: unknown) => ({ ...run, ...(result as Record<string, unknown>) }));
    service.failAgentRun.mockResolvedValue(undefined);
  });

  it("completes a run from a validated final decision", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "The answer is violet." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Find the color", provider: model, registry: new ToolRegistry() })).resolves.toMatchObject({ status: "COMPLETED", finalResponse: "The answer is violet" });
    expect(service.recordAgentRunStep).toHaveBeenCalledWith(expect.objectContaining({ type: "MODEL_DECISION", safeOutputMetadata: { decisionType: "final", finalResponseChars: 20 } }), expect.anything());
    expect(service.completeAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "COMPLETED", finalResponse: "The answer is violet" }), expect.anything());
  });

  it("executes only an effective allowed tool and passes trusted context", async () => {
    const model = provider();
    const registered = tool();
    const registry = new ToolRegistry();
    registry.register(registered);
    vi.mocked(model.generateStructured)
      .mockResolvedValueOnce({ value: { type: "tool", tool: { name: "test_tool", arguments: { query: "campaign color" } } }, text: "", model: "test", done: true, durationMs: 1 })
      .mockResolvedValueOnce({ value: { type: "final", final: "Violet." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Find the color", provider: model, registry })).resolves.toMatchObject({ status: "COMPLETED", finalResponse: "Violet." });
    expect(registered.execute).toHaveBeenCalledWith({ query: "campaign color" }, expect.objectContaining({ workspaceId: "workspace-a", userId: "user-a", agentId: "agent-a", runId: "run-a", brandId: "brand-a", abortSignal: expect.any(AbortSignal) }));
    expect(model.generateStructured.mock.calls[1]?.[0].prompt).toContain("violet");
    expect(JSON.stringify(service.recordAgentRunStep.mock.calls)).not.toContain("The fact is violet");
  });

  it("rejects unknown, disallowed, and invalid tool decisions without executing a tool", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "tool", tool: { name: "missing_tool", arguments: {} } }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Do it", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_UNKNOWN_TOOL" });
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "FAILED", errorCode: "AGENT_UNKNOWN_TOOL" }), expect.anything());
  });

  it("requests one bounded correction when tool arguments fail schema validation", async () => {
    const model = provider();
    const registered = tool();
    const registry = new ToolRegistry();
    registry.register(registered);
    vi.mocked(model.generateStructured)
      .mockResolvedValueOnce({ value: { type: "tool", tool: { name: "test_tool", arguments: {} } }, text: "", model: "test", done: true, durationMs: 1 })
      .mockResolvedValueOnce({ value: { type: "tool", tool: { name: "test_tool", arguments: { query: "campaign color" } } }, text: "", model: "test", done: true, durationMs: 1 })
      .mockResolvedValueOnce({ value: { type: "final", final: "Violet." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Find the color", provider: model, registry })).resolves.toMatchObject({ status: "COMPLETED", finalResponse: "Violet." });
    expect(model.generateStructured).toHaveBeenCalledTimes(3);
    expect(registered.execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(service.recordAgentRunStep.mock.calls)).not.toContain("campaign color");
  });

  it("fails safely on malformed model decisions", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "tool", tool: { name: "test_tool" } }, text: "", model: "test", done: true, durationMs: 1 } as never);

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Do it", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_INVALID_DECISION" });
  });

  it("terminates at the configured maximum step count", async () => {
    const model = provider();
    const registered = tool();
    const registry = new ToolRegistry();
    registry.register(registered);
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "tool", tool: { name: "test_tool", arguments: { query: "repeat" } } }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Repeat", provider: model, registry })).resolves.toMatchObject({ status: "MAX_STEPS_REACHED", stepCount: 3, errorCode: "AGENT_MAX_STEPS" });
    expect(model.generateStructured).toHaveBeenCalledTimes(3);
  });

  it("maps a model timeout to a failed persisted run", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockImplementation(() => new Promise(() => undefined));

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Wait", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_TIMEOUT" });
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "FAILED", errorCode: "AGENT_TIMEOUT" }), expect.anything());
  });

  it("truncates the final response before persistence", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "1234567890123456789012345" }, text: "", model: "test", done: true, durationMs: 1 });

    const result = await runAgent({ userId: "user-a", agentId: "agent-a", goal: "Answer", provider: model, registry: new ToolRegistry() });

    expect(result.finalResponse).toHaveLength(20);
    expect(service.completeAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ finalResponse: "12345678901234567890" }), expect.anything());
  });

  it("persists cancellation only when the request abort is observed", async () => {
    const model = provider();
    const controller = new AbortController();
    let started!: () => void;
    const modelStarted = new Promise<void>((resolve) => { started = resolve; });
    vi.mocked(model.generateStructured).mockImplementation(async (input) => {
      started();
      await new Promise<void>((resolve) => input.signal?.addEventListener("abort", () => resolve(), { once: true }));
      throw new DOMException("aborted", "AbortError");
    });
    const running = runAgent({ userId: "user-a", agentId: "agent-a", goal: "Cancel", provider: model, registry: new ToolRegistry(), abortSignal: controller.signal });
    await modelStarted;
    controller.abort();

    await expect(running).rejects.toMatchObject({ code: "AGENT_CANCELLED" });
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "CANCELLED", errorCode: "AGENT_CANCELLED" }), expect.anything());
  });
});

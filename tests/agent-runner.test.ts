import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InvalidStructuredOutputError } from "@/lib/ai/errors";
import { getAIConfig } from "@/lib/ai/config";
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

  it("uses the configured output budget for long structured agent results", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockImplementation(async (input) => {
      if (input.maxTokens === 400) throw new InvalidStructuredOutputError();
      return { value: { type: "final", final: "The bounded marketing plan is complete." }, text: "", model: "test", done: true, durationMs: 1 } as never;
    });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Create a detailed seven-day marketing plan", provider: model, registry: new ToolRegistry() })).resolves.toMatchObject({ status: "COMPLETED" });
    expect(model.generateStructured.mock.calls[0]?.[0].maxTokens).toBe(getAIConfig().maxOutputTokens);
  });

  it("classifies invalid provider structured output as an invalid agent decision", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockRejectedValue(new InvalidStructuredOutputError());

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Answer with the saved facts", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_INVALID_DECISION" });
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "FAILED", errorCode: "AGENT_INVALID_DECISION" }), expect.anything());
  });

  it("performs one bounded repair attempt after malformed provider structured output", async () => {
    const model = provider();
    vi.mocked(model.generateStructured)
      .mockRejectedValueOnce(new InvalidStructuredOutputError())
      .mockResolvedValueOnce({ value: { type: "final", final: "The plan is ready." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Create a detailed seven-day marketing plan", provider: model, registry: new ToolRegistry() })).resolves.toMatchObject({ status: "COMPLETED", finalResponse: "The plan is ready." });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
    expect(model.generateStructured.mock.calls[1]?.[0].system).toContain("previous response was not complete valid JSON");
  });

  it("persists only safe provider diagnostics when malformed structured output remains invalid", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockRejectedValue(new InvalidStructuredOutputError());

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Create a detailed seven-day marketing plan", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_INVALID_DECISION" });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
    expect(service.recordAgentRunStep).toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR", safeOutputMetadata: { errorCode: "AGENT_INVALID_DECISION", providerErrorCode: "INVALID_STRUCTURED_OUTPUT", providerErrorClass: "InvalidStructuredOutputError" } }), expect.anything());
  });

  it("runs an agent with no tools without advertising an arbitrary tool branch", async () => {
    const model = provider();
    service.startAgentRun.mockResolvedValueOnce({ agent: { ...agent, allowedTools: [] }, run, policy });
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "There are no tool calls." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Answer directly", provider: model, registry: new ToolRegistry() })).resolves.toMatchObject({ status: "COMPLETED" });
    expect((model.generateStructured.mock.calls[0]?.[0].format as { oneOf: unknown[] }).oneOf).toHaveLength(1);
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

  it("preloads the configured read-only brand tools before the first model decision", async () => {
    const model = provider();
    const search = { ...tool(), name: "search_brand_knowledge", inputSchema: z.object({ query: z.string().min(1), topK: z.number().int().min(1).max(5) }).strict() } as unknown as AgentTool<unknown, unknown>;
    const profile = { ...tool(), name: "get_brand_profile", inputSchema: z.object({}).strict() } as unknown as AgentTool<unknown, unknown>;
    const registry = new ToolRegistry();
    registry.register(search);
    registry.register(profile);
    service.startAgentRun.mockResolvedValueOnce({ agent: { ...agent, allowedTools: ["search_brand_knowledge", "get_brand_profile"] }, run, policy });
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "The saved facts are available." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Find the saved facts", provider: model, registry })).resolves.toMatchObject({ status: "COMPLETED" });
    expect(search.execute).toHaveBeenCalledWith({ query: "Find the saved facts", topK: 5 }, expect.anything());
    expect(profile.execute).toHaveBeenCalledWith({}, expect.anything());
    expect(model.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("repairs an unsupported final and only completes grounded text", async () => {
    const model = provider();
    const search = {
      ...tool(),
      name: "search_brand_knowledge",
      inputSchema: z.object({ query: z.string().min(1), topK: z.number().int().min(1).max(5) }).strict(),
      execute: vi.fn().mockResolvedValue({
        modelObservation: { results: [{ content: "Classic Chocolate Brownies cost RM25 per box of 6 brownies. Order through WhatsApp." }] },
        safeSummary: { metadata: { resultCount: 1 }, durationMs: 1, characterCount: 120 },
      }),
    } as unknown as AgentTool<unknown, unknown>;
    const registry = new ToolRegistry();
    registry.register(search);
    service.startAgentRun.mockResolvedValueOnce({ agent: { ...agent, allowedTools: ["search_brand_knowledge"] }, run, policy });
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "Enjoy 50% off and free delivery. Classic Chocolate Brownies cost RM25 per box of 6 brownies. Order through WhatsApp." }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Use the saved facts", provider: model, registry })).resolves.toMatchObject({ status: "COMPLETED" });
    expect(model.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("repairs an unsafe final without persisting the unsafe model text", async () => {
    const model = provider();
    const search = {
      ...tool(),
      name: "search_brand_knowledge",
      inputSchema: z.object({ query: z.string().min(1), topK: z.number().int().min(1).max(5) }).strict(),
      execute: vi.fn().mockResolvedValue({
        modelObservation: { results: [{ content: "Classic Chocolate Brownies cost RM25 per box." }] },
        safeSummary: { metadata: { resultCount: 1 }, durationMs: 1, characterCount: 80 },
      }),
    } as unknown as AgentTool<unknown, unknown>;
    const registry = new ToolRegistry();
    registry.register(search);
    service.startAgentRun.mockResolvedValueOnce({ agent: { ...agent, allowedTools: ["search_brand_knowledge"] }, run, policy });
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "final", final: "Enjoy 50% off and free delivery." }, text: "", model: "test", done: true, durationMs: 1 });

    const result = await runAgent({ userId: "user-a", agentId: "agent-a", goal: "Use the saved facts", provider: model, registry });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalResponse).not.toContain("50%");
    expect(result.finalResponse).not.toContain("free delivery");
    expect(service.completeAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "COMPLETED" }), expect.anything());
    expect(service.failAgentRun).not.toHaveBeenCalled();
    expect(JSON.stringify(service.recordAgentRunStep.mock.calls)).not.toContain("Enjoy 50% off");
    expect(service.recordAgentRunStep).toHaveBeenCalledWith(expect.objectContaining({ type: "MODEL_DECISION", safeOutputMetadata: expect.objectContaining({ groundingRepairApplied: true }) }), expect.anything());
  });

  it("rejects unknown, disallowed, and invalid tool decisions without executing a tool", async () => {
    const model = provider();
    vi.mocked(model.generateStructured).mockResolvedValue({ value: { type: "tool", tool: { name: "missing_tool", arguments: {} } }, text: "", model: "test", done: true, durationMs: 1 });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Do it", provider: model, registry: new ToolRegistry() })).rejects.toMatchObject({ code: "AGENT_UNKNOWN_TOOL" });
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "FAILED", errorCode: "AGENT_UNKNOWN_TOOL" }), expect.anything());
  });

  it("fails a legacy brand-tool row before calling the model", async () => {
    const model = provider();
    const registered = tool();
    const registry = new ToolRegistry();
    registry.register(registered);
    service.startAgentRun.mockResolvedValueOnce({ agent: { ...agent, brandId: null }, run, policy });

    await expect(runAgent({ userId: "user-a", agentId: "agent-a", goal: "Do it", provider: model, registry })).rejects.toMatchObject({ code: "AGENT_TOOL_BRAND_REQUIRED" });
    expect(model.generateStructured).not.toHaveBeenCalled();
    expect(registered.execute).not.toHaveBeenCalled();
    expect(service.failAgentRun).toHaveBeenCalledWith("run-a", expect.objectContaining({ status: "FAILED", errorCode: "AGENT_TOOL_BRAND_REQUIRED" }), expect.anything());
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

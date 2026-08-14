import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareGeneration: vi.fn(),
  generateText: vi.fn(),
  getAIProvider: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock("@/lib/ai/service", () => mocks);
vi.mock("@/lib/agents/runner", () => ({ runAgent: mocks.runAgent }));

import { agentExecutor } from "@/lib/workflows/executors/agent";
import { aiGenerateExecutor } from "@/lib/workflows/executors/ai-generate";

const baseContext = {
  runId: "run-1",
  workspaceId: "workspace-1",
  actorUserId: "user-1",
  workflowId: "workflow-1",
  workflowVersion: 1,
  triggerInput: { prompt: "hello" },
  stepOutputs: {},
  abortSignal: new AbortController().signal,
  db: {} as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAIProvider.mockReturnValue({});
  mocks.prepareGeneration.mockResolvedValue({ providerInput: {}, provider: {}, config: { provider: "ollama", model: "test", temperature: 0, maxOutputTokens: 50, maxPromptChars: 1000 }, workspaceId: "workspace-1", userId: "user-1", inputChars: 5 });
  mocks.generateText.mockResolvedValue({ text: "generated", model: "test", durationMs: 12 });
  mocks.runAgent.mockImplementation(async (input: { onRunCreated?: (run: { id: string }) => Promise<void> }) => {
    await input.onRunCreated?.({ id: "agent-run-1" });
    return { runId: "agent-run-1", status: "COMPLETED", stepCount: 1, finalResponse: "agent result", errorCode: null };
  });
});

describe("workflow AI and Agent executors", () => {
  it("uses the LLMProvider abstraction and propagates the workflow abort signal", async () => {
    const provider = {} as never;
    const context = { ...baseContext, provider };
    const result = await aiGenerateExecutor.execute(context, { prompt: { kind: "reference", path: "trigger.prompt" } });
    expect(result).toMatchObject({ output: "generated", safeMetadata: { operation: "AI_GENERATE", model: "test" } });
    expect(mocks.prepareGeneration).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: context.abortSignal, prompt: "hello", userId: "user-1", workspaceId: "workspace-1" }), provider, context.db);
  });

  it("persists the subordinate AgentRun ID without duplicating AgentRun data", async () => {
    const result = await agentExecutor.execute(baseContext, { agentId: "11111111-1111-4111-8111-111111111111", goal: { kind: "literal", value: "answer" } });
    expect(result).toMatchObject({ output: "agent result", agentRunId: "agent-run-1", safeMetadata: { operation: "AGENT", agentRunId: "agent-run-1" } });
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "11111111-1111-4111-8111-111111111111", abortSignal: baseContext.abortSignal, db: baseContext.db }));
  });
});

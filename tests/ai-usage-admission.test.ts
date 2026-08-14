import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreparedGeneration } from "@/lib/ai/service";

const admission = vi.hoisted(() => ({ admitAiGeneration: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/usage/service", () => admission);
vi.mock("@/lib/ai/generation-log", () => ({ recordGenerationLog: vi.fn().mockResolvedValue(undefined) }));

import { generateText, streamText } from "@/lib/ai/service";

function prepared(provider: PreparedGeneration["provider"]): PreparedGeneration {
  return {
    provider,
    providerInput: { prompt: "safe prompt" },
    config: { provider: "ollama", model: "test-model", baseUrl: "http://localhost:11434", temperature: 0.4, maxOutputTokens: 100, timeoutMs: 1000, maxPromptChars: 1000 },
    workspaceId: "workspace-a",
    userId: "user-a",
    principal: { kind: "user", userId: "user-a" },
    inputChars: 11,
    usage: { operationKey: "direct-ai:req-1", sourceType: "DIRECT_AI", sourceId: "req-1" },
  };
}

describe("AI usage admission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admits a generation before invoking the provider", async () => {
    const provider = { generate: vi.fn().mockResolvedValue({ text: "ok", model: "test-model", done: true, durationMs: 1 }), stream: vi.fn(), generateStructured: vi.fn(), health: vi.fn() };
    await expect(generateText(prepared(provider))).resolves.toMatchObject({ text: "ok" });
    expect(admission.admitAiGeneration).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-a", operationKey: "direct-ai:req-1", sourceType: "DIRECT_AI", db: expect.anything() }));
    expect(admission.admitAiGeneration.mock.invocationCallOrder[0]).toBeLessThan(provider.generate.mock.invocationCallOrder[0]);
  });

  it("admits streaming generation before opening the provider stream", async () => {
    const provider = { generate: vi.fn(), stream: vi.fn(async function* () { yield { text: "ok", model: "test-model", done: true, durationMs: 1 }; }), generateStructured: vi.fn(), health: vi.fn() };
    const chunks: unknown[] = [];
    for await (const chunk of streamText(prepared(provider))) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(admission.admitAiGeneration).toHaveBeenCalledTimes(1);
    expect(admission.admitAiGeneration.mock.invocationCallOrder[0]).toBeLessThan(provider.stream.mock.invocationCallOrder[0]);
  });
});

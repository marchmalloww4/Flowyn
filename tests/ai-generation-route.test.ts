import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, prepareGeneration, generateText, streamText } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prepareGeneration: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser }));
vi.mock("@/lib/ai/service", () => ({ prepareGeneration, generateText, streamText }));

import { POST } from "@/app/api/ai/generate/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI generation route", () => {
  it("authenticates and returns a typed non-streaming result", async () => {
    requireUser.mockResolvedValue({ id: "user-1" });
    prepareGeneration.mockResolvedValue({ provider: {}, providerInput: {}, config: { provider: "ollama" }, workspaceId, userId: "user-1", inputChars: 10 });
    generateText.mockResolvedValue({ text: "Hello", model: "llama3.2:3b", done: true, durationMs: 12 });

    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ workspaceId, prompt: "Say hello" }), headers: { "Content-Type": "application/json", "Idempotency-Key": "request-1" } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { text: "Hello", model: "llama3.2:3b" } });
    expect(prepareGeneration).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", workspaceId, prompt: "Say hello", usage: { operationKey: "direct-ai:request-1", sourceType: "DIRECT_AI", sourceId: "request-1", correlationId: expect.any(String) } }));
  });

  it("rejects malformed requests before calling the generation service", async () => {
    requireUser.mockResolvedValue({ id: "user-1" });

    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ prompt: "Missing workspace" }), headers: { "Content-Type": "application/json" } }));

    expect(response.status).toBe(400);
    expect(prepareGeneration).not.toHaveBeenCalled();
  });

  it("returns provider-native chunks as server-sent events", async () => {
    requireUser.mockResolvedValue({ id: "user-1" });
    prepareGeneration.mockResolvedValue({ provider: {}, providerInput: {}, config: { provider: "ollama" }, workspaceId, userId: "user-1", inputChars: 10 });
    streamText.mockReturnValue((async function* () {
      yield { text: "Hello", model: "llama3.2:3b", done: false };
      yield { text: " world", model: "llama3.2:3b", done: true };
    })());

    const response = await POST(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ workspaceId, prompt: "Say hello", stream: true }), headers: { "Content-Type": "application/json" } }));
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"text":"Hello"');
    expect(body).toContain('"text":" world"');
    expect(body).toContain("[DONE]");
  });
});

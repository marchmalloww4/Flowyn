import { describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/lib/ai/ollama-provider";
import { AIProviderError } from "@/lib/ai/types";

function tagsResponse() {
  return new Response(JSON.stringify({ models: [{ name: "llama3.2:3b" }] }), { status: 200 });
}

describe("OllamaProvider", () => {
  it("posts a non-streaming generation request and parses the result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ response: "Hello from local AI", model: "llama3.2:3b", done: true }), { status: 200 }));
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", defaultModel: "llama3.2:3b", fetcher });
    await expect(provider.generate({ prompt: "Say hello", temperature: 0.2, maxTokens: 50 })).resolves.toMatchObject({ text: "Hello from local AI", model: "llama3.2:3b", done: true });
    expect(fetcher).toHaveBeenCalledWith("http://ollama.test/api/generate", expect.objectContaining({ method: "POST", body: expect.stringContaining('"stream":false') }));
  });

  it("reports a missing configured model without exposing the base URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), { status: 200 }));
    const provider = new OllamaProvider({ baseUrl: "http://secret-ollama.test", defaultModel: "llama3.2:3b", fetcher });
    await expect(provider.health()).resolves.toEqual({ ready: false, model: "llama3.2:3b", errorCode: "MODEL_MISSING" });
  });

  it("maps a network failure to a safe provider error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("http://secret-ollama.test refused"));
    const provider = new OllamaProvider({ baseUrl: "http://secret-ollama.test", fetcher });
    await expect(provider.generate({ prompt: "hello" })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(provider.generate({ prompt: "hello" })).rejects.not.toThrow("secret-ollama");
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("timed out", "AbortError"));
    const provider = new OllamaProvider({ baseUrl: "http://secret-ollama.test", fetcher, timeoutMs: 5 });
    await expect(provider.generate({ prompt: "hello" })).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", status: 504 });
  });

  it("maps a model-not-found response to MODEL_MISSING", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tagsResponse()).mockResolvedValueOnce(new Response(JSON.stringify({ error: "model not found" }), { status: 404 }));
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", fetcher });
    const result = provider.generate({ prompt: "hello" });
    await expect(result).rejects.toBeInstanceOf(AIProviderError);
    await expect(result).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  it("observes a caller abort signal during generation", async () => {
    const controller = new AbortController();
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith("/api/tags")) return tagsResponse();
      requestStarted();
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });
    const provider = new OllamaProvider({ baseUrl: "http://ollama.test", fetcher, timeoutMs: 1000 });
    const result = provider.generate({ prompt: "hello", signal: controller.signal });
    await started;
    const abortedAt = performance.now();
    controller.abort();

    await expect(result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(performance.now() - abortedAt).toBeLessThan(500);
  });
});

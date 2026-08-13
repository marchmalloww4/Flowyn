import { describe, expect, it, vi } from "vitest";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { DimensionMismatchError, EmbeddingError, ModelUnavailableError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/embeddings/errors";
import { OllamaEmbeddingProvider } from "@/lib/embeddings/ollama-provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function provider(fetcher: typeof fetch) {
  return new OllamaEmbeddingProvider({
    config: { ...getEmbeddingConfig(), baseUrl: "http://ollama.test", model: "nomic-embed-text", dimension: 3 },
    fetcher,
  });
}

describe("OllamaEmbeddingProvider", () => {
  it("embeds text and validates the configured dimension", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "nomic-embed-text" }] }))
      .mockResolvedValueOnce(jsonResponse({ model: "nomic-embed-text", embeddings: [[0.1, 0.2, 0.3]] }));

    await expect(provider(fetcher).embedText("hello")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(fetcher).toHaveBeenNthCalledWith(2, "http://ollama.test/api/embed", expect.objectContaining({ method: "POST" }));
  });

  it("embeds multiple documents in order", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ models: [{ model: "nomic-embed-text" }] }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]] }));

    await expect(provider(fetcher).embedDocuments(["one", "two"])).resolves.toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
  });

  it("rejects empty input as invalid", async () => {
    await expect(provider(vi.fn<typeof fetch>()).embedText("  ")).rejects.toMatchObject({ code: "INVALID_REQUEST" } satisfies Partial<EmbeddingError>);
  });

  it("accepts the untagged configured model against the reported latest tag", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "nomic-embed-text:latest", model: "nomic-embed-text:latest" }] }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: [[0.1, 0.2, 0.3]] }));

    await expect(provider(fetcher).embedText("hello")).resolves.toEqual([0.1, 0.2, 0.3]);
  });

  it("rejects a missing embedding model", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ models: [] }));

    await expect(provider(fetcher).embedText("hello")).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("maps network failures to provider unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection refused"));

    await expect(provider(fetcher).embedText("hello")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("maps aborted requests to timeout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));

    const embeddingProvider = new OllamaEmbeddingProvider({
      config: { ...getEmbeddingConfig(), baseUrl: "http://ollama.test", model: "nomic-embed-text", dimension: 3, timeoutMs: 5 },
      fetcher,
    });
    await expect(embeddingProvider.embedText("hello")).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it("rejects malformed responses", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "nomic-embed-text" }] }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: "not-a-vector" }));

    await expect(provider(fetcher).embedText("hello")).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
  });

  it("rejects a response with an unverified dimension", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "nomic-embed-text" }] }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: [[0.1, 0.2]] }));

    await expect(provider(fetcher).embedText("hello")).rejects.toBeInstanceOf(DimensionMismatchError);
  });
});

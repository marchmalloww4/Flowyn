import { describe, expect, it } from "vitest";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { DimensionMismatchError, ModelUnavailableError } from "@/lib/embeddings/errors";
import { OllamaEmbeddingProvider } from "@/lib/embeddings/ollama-provider";

const integration = process.env.RUN_OLLAMA_INTEGRATION === "1" ? describe : describe.skip;

integration("local Ollama embedding integration", () => {
  it("returns the verified dimension from the live embedding model", async () => {
    const config = getEmbeddingConfig();
    const vector = await new OllamaEmbeddingProvider().embedText("Flowyn is a local-first automation platform.");

    expect(config.model).toBe("nomic-embed-text");
    expect(vector).toHaveLength(768);
    expect(vector).toHaveLength(config.dimension);
    expect(vector.every((value) => Number.isFinite(value))).toBe(true);
  }, 120000);

  it("embeds several documents in a single live request", async () => {
    const vectors = await new OllamaEmbeddingProvider().embedDocuments(["Flowyn stores brand knowledge.", "Retrieval is workspace scoped."]);

    expect(vectors).toHaveLength(2);
    expect(vectors.every((vector) => vector.length === 768)).toBe(true);
    expect(vectors[0]).not.toEqual(vectors[1]);
  }, 120000);

  it("fails explicitly when the configured dimension does not match the live model", async () => {
    const provider = new OllamaEmbeddingProvider({ config: { ...getEmbeddingConfig(), dimension: 1536 } });

    await expect(provider.embedText("dimension guard")).rejects.toBeInstanceOf(DimensionMismatchError);
  }, 120000);

  it("fails explicitly when the configured model is not installed", async () => {
    const provider = new OllamaEmbeddingProvider({ config: { ...getEmbeddingConfig(), model: "flowyn-nonexistent-embedding-model" } });

    await expect(provider.embedText("model guard")).rejects.toBeInstanceOf(ModelUnavailableError);
  }, 120000);
});

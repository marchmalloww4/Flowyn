import { afterEach, describe, expect, it } from "vitest";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { resetEnvForTests } from "@/lib/env";

const originalDimension = process.env.OLLAMA_EMBEDDING_DIMENSION;

afterEach(() => {
  if (originalDimension === undefined) delete process.env.OLLAMA_EMBEDDING_DIMENSION;
  else process.env.OLLAMA_EMBEDDING_DIMENSION = originalDimension;
  resetEnvForTests();
});

describe("embedding configuration", () => {
  it("uses the verified live embedding dimension", () => {
    delete process.env.OLLAMA_EMBEDDING_DIMENSION;
    resetEnvForTests();

    expect(getEmbeddingConfig()).toMatchObject({
      model: "nomic-embed-text",
      dimension: 768,
      timeoutMs: 60000,
    });
  });

  it("rejects a non-positive embedding dimension", () => {
    process.env.OLLAMA_EMBEDDING_DIMENSION = "0";
    resetEnvForTests();

    expect(() => getEmbeddingConfig()).toThrow();
  });
});

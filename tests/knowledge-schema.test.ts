import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { knowledgeChunks, knowledgeDocuments, schema } from "@/lib/database/schema";

describe("Milestone 4 knowledge schema", () => {
  it("exports document and vector chunk tables", () => {
    expect(schema.knowledgeDocuments).toBe(knowledgeDocuments);
    expect(schema.knowledgeChunks).toBe(knowledgeChunks);
    expect(knowledgeDocuments.workspaceId).toBeDefined();
    expect(knowledgeDocuments.brandId).toBeDefined();
    expect(knowledgeChunks.workspaceId).toBeDefined();
    expect(knowledgeChunks.brandId).toBeDefined();
    expect(knowledgeChunks.documentId).toBeDefined();
  });

  it("uses the verified 768-dimensional vector type and a cosine HNSW index", () => {
    expect(knowledgeChunks.embedding.getSQLType()).toBe("vector(768)");
    const indexes = getTableConfig(knowledgeChunks).indexes.map((index) => index.config);
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "knowledge_chunks_embedding_hnsw_idx", method: "hnsw" }),
    ]));
  });

  it("has indexing status and safe metadata fields", () => {
    expect(knowledgeDocuments.status).toBeDefined();
    expect(knowledgeDocuments.contentHash).toBeDefined();
    expect(knowledgeDocuments.metadata).toBeDefined();
    expect(knowledgeChunks.metadata).toBeDefined();
    expect("prompt" in knowledgeDocuments).toBe(false);
    expect("response" in knowledgeChunks).toBe(false);
  });
});

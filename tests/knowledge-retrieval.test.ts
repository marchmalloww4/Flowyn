import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const verifiedVector = Array.from({ length: 768 }, (_value, index) => index / 768);

function database() {
  const rows = [{ content: "Relevant fact", stableKey: "doc-1:0:hash", metadata: { source: "manual" }, similarity: 0.91, documentId: "doc-1", title: "Facts", sourceType: "manual", sourceName: "Notes" }];
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  return { select, where, limit, orderBy };
}

describe("semantic knowledge retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId, name: "Acme" } as never);
  });

  it("embeds the query, filters in SQL, applies topK, and omits embeddings", async () => {
    const provider: EmbeddingProvider = { embedText: vi.fn().mockResolvedValue(verifiedVector), embedDocuments: vi.fn() };
    const db = database();

    const results = await retrieveKnowledge({ userId: "user-1", brandId, query: "product fact", topK: 3 }, db as never, provider);

    expect(provider.embedText).toHaveBeenCalledWith("product fact");
    expect(db.where).toHaveBeenCalled();
    expect(db.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(db.limit).toHaveBeenCalledWith(3);
    expect(results).toEqual([{ content: "Relevant fact", stableKey: "doc-1:0:hash", metadata: { source: "manual" }, similarity: 0.91, documentId: "doc-1", title: "Facts", sourceType: "manual", sourceName: "Notes" }]);
    expect(results[0]).not.toHaveProperty("embedding");
  });

  it("rejects a query vector that does not match the verified dimension", async () => {
    const provider: EmbeddingProvider = { embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]), embedDocuments: vi.fn() };
    const db = database();

    await expect(retrieveKnowledge({ userId: "user-1", brandId, query: "product fact", topK: 3 }, db as never, provider)).rejects.toMatchObject({ code: "EMBEDDING_DIMENSION_MISMATCH" });
    expect(db.limit).not.toHaveBeenCalled();
  });

  it("rejects an unbounded top-K before embedding the query", async () => {
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn() };

    await expect(retrieveKnowledge({ userId: "user-1", brandId, query: "product fact", topK: 100 }, database() as never, provider)).rejects.toMatchObject({ code: "INVALID_KNOWLEDGE_TOP_K", status: 400 });
    expect(provider.embedText).not.toHaveBeenCalled();
  });

  it("does not retrieve a brand the caller cannot access", async () => {
    vi.mocked(getBrand).mockRejectedValue(new Error("not found"));
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn() };

    await expect(retrieveKnowledge({ userId: "user-1", brandId, query: "secret", topK: 3 }, database() as never, provider)).rejects.toThrow("not found");
    expect(provider.embedText).not.toHaveBeenCalled();
  });
});

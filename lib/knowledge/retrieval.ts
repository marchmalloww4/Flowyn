import { and, asc, eq, sql } from "drizzle-orm";
import { getBrand } from "@/lib/brands/service";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { OllamaEmbeddingProvider } from "@/lib/embeddings/ollama-provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import { getDatabase, knowledgeChunks, knowledgeDocuments, type Database } from "@/lib/database";
import { AppError } from "@/lib/security/errors";

export interface RetrievedKnowledge {
  documentId: string;
  title: string;
  sourceType: string;
  sourceName: string | null;
  stableKey: string;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
  similarity: number;
}

function vectorLiteral(vector: number[]): string {
  const expected = getEmbeddingConfig().dimension;
  if (vector.length !== expected || vector.some((value) => !Number.isFinite(value))) throw new AppError("EMBEDDING_DIMENSION_MISMATCH", 502, "The embedding dimension does not match the configured model.");
  return `[${vector.join(",")}]`;
}

export async function retrieveKnowledge(input: { userId: string; brandId: string; query: string; topK: number }, db: Database = getDatabase(), provider: EmbeddingProvider = new OllamaEmbeddingProvider()): Promise<RetrievedKnowledge[]> {
  if (!input.query.trim()) throw new AppError("INVALID_KNOWLEDGE_QUERY", 400, "A retrieval query is required.");
  if (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > 20) throw new AppError("INVALID_KNOWLEDGE_TOP_K", 400, "topK must be between 1 and 20.");
  const brand = await getBrand(input.userId, input.brandId, db);
  const queryVector = await provider.embedText(input.query);
  const literal = vectorLiteral(queryVector);
  const distance = sql<number>`${knowledgeChunks.embedding} <=> ${literal}::vector`;
  const rows = await db.select({
    documentId: knowledgeChunks.documentId,
    title: knowledgeDocuments.title,
    sourceType: knowledgeDocuments.sourceType,
    sourceName: knowledgeDocuments.sourceName,
    stableKey: knowledgeChunks.stableKey,
    content: knowledgeChunks.content,
    metadata: knowledgeChunks.metadata,
    similarity: sql<number>`1 - (${distance})`,
  }).from(knowledgeChunks).innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id)).where(and(
    eq(knowledgeChunks.workspaceId, brand.workspaceId),
    eq(knowledgeChunks.brandId, brand.id),
    eq(knowledgeDocuments.status, "READY"),
  )).orderBy(distance, asc(knowledgeChunks.stableKey)).limit(input.topK);
  return rows;
}

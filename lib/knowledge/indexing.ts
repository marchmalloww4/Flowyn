import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, knowledgeChunks, knowledgeDocuments, type Database } from "@/lib/database";
import { EmbeddingError } from "@/lib/embeddings/errors";
import { OllamaEmbeddingProvider } from "@/lib/embeddings/ollama-provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import { chunkDocument } from "@/lib/knowledge/chunking";
import { getKnowledgeDocument } from "@/lib/knowledge/service";
import { AppError } from "@/lib/security/errors";

export function hashKnowledgeContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function contentHashCondition(contentHash: string | null | undefined) {
  return contentHash == null ? isNull(knowledgeDocuments.contentHash) : eq(knowledgeDocuments.contentHash, contentHash);
}

function nullableTextCondition(column: typeof knowledgeDocuments.sourceName, value: string | null | undefined) {
  return value == null ? isNull(column) : eq(column, value);
}

type KnowledgeDocumentVersion = {
  id: string;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
  sourceType: string;
  sourceName: string | null;
  contentHash: string | null;
  status: string;
};

function documentVersionCondition(document: KnowledgeDocumentVersion) {
  return and(
    eq(knowledgeDocuments.id, document.id),
    eq(knowledgeDocuments.content, document.content),
    eq(knowledgeDocuments.metadata, document.metadata),
    eq(knowledgeDocuments.sourceType, document.sourceType),
    nullableTextCondition(knowledgeDocuments.sourceName, document.sourceName),
    contentHashCondition(document.contentHash),
    eq(knowledgeDocuments.status, document.status as "PENDING" | "PROCESSING" | "READY" | "FAILED"),
  );
}

export async function indexKnowledgeDocument(userId: string, documentId: string, db: Database = getDatabase(), provider: EmbeddingProvider = new OllamaEmbeddingProvider()) {
  const document = await getKnowledgeDocument(userId, documentId, db);
  await requireWorkspaceAction(userId, document.workspaceId, "brand.write", db);
  const contentHash = hashKnowledgeContent(document.content);
  if (document.status === "READY" && document.contentHash === contentHash) return document;
  const chunks = chunkDocument(document.content, { documentId });
  const [processing] = await db.update(knowledgeDocuments)
    .set({ status: "PROCESSING", errorCode: null, updatedAt: new Date() })
    .where(documentVersionCondition(document))
    .returning({ id: knowledgeDocuments.id });
  if (!processing) throw new AppError("KNOWLEDGE_INDEX_STALE", 409, "The knowledge document changed while indexing was starting.");
  try {
    const embeddings = await provider.embedDocuments(chunks.map((chunk) => chunk.content));
    if (embeddings.length !== chunks.length) throw new AppError("KNOWLEDGE_EMBEDDING_COUNT_MISMATCH", 502, "The embedding provider returned an invalid number of vectors.");
    const indexed = await db.transaction(async (tx) => {
      const [updated] = await tx.update(knowledgeDocuments)
        .set({ contentHash, status: "READY", errorCode: null, updatedAt: new Date() })
        .where(and(
          documentVersionCondition({ ...document, status: "PROCESSING" }),
          eq(knowledgeDocuments.status, "PROCESSING"),
        ))
        .returning();
      if (!updated) throw new AppError("KNOWLEDGE_INDEX_STALE", 409, "The knowledge document changed while indexing was in progress.");
      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, document.id));
      await tx.insert(knowledgeChunks).values(chunks.map((chunk, index) => ({
        workspaceId: document.workspaceId,
        brandId: document.brandId,
        documentId: document.id,
        chunkIndex: chunk.index,
        stableKey: chunk.stableKey,
        content: chunk.content,
        metadata: { ...document.metadata, sourceType: document.sourceType, sourceName: document.sourceName, chunkIndex: chunk.index },
        embedding: embeddings[index]!,
      })));
      await recordAuditEvent({ workspaceId: document.workspaceId, actorUserId: userId, action: "knowledge.reindexed", resourceType: "knowledge", resourceId: document.id, metadata: { chunkCount: chunks.length } }, tx);
      return updated;
    });
    if (!indexed) throw new AppError("KNOWLEDGE_INDEX_FAILED", 500, "Knowledge document could not be indexed.");
    return indexed;
  } catch (error) {
    const errorCode = error instanceof EmbeddingError ? error.code : error instanceof AppError ? error.code : "KNOWLEDGE_INDEX_FAILED";
    await db.update(knowledgeDocuments)
      .set({ status: "FAILED", errorCode, updatedAt: new Date() })
      .where(and(
        documentVersionCondition({ ...document, status: "PROCESSING" }),
        eq(knowledgeDocuments.workspaceId, document.workspaceId),
        eq(knowledgeDocuments.status, "PROCESSING"),
      ))
      .returning();
    if (error instanceof EmbeddingError || error instanceof AppError) throw error;
    throw new AppError("KNOWLEDGE_INDEX_FAILED", 502, "Knowledge document indexing failed.");
  }
}

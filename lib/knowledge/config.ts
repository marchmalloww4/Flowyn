import { getEnv } from "@/lib/env";

export interface KnowledgeConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxDocumentChars: number;
  maxContextChars: number;
  topK: number;
}

export function getKnowledgeConfig(): KnowledgeConfig {
  const env = getEnv();
  if (env.KNOWLEDGE_CHUNK_OVERLAP >= env.KNOWLEDGE_CHUNK_SIZE) throw new Error("Knowledge chunk overlap must be smaller than chunk size.");
  return Object.freeze({
    chunkSize: env.KNOWLEDGE_CHUNK_SIZE,
    chunkOverlap: env.KNOWLEDGE_CHUNK_OVERLAP,
    maxDocumentChars: env.MAX_KNOWLEDGE_DOCUMENT_CHARS,
    maxContextChars: env.RAG_MAX_CONTEXT_CHARS,
    topK: env.RAG_TOP_K,
  });
}

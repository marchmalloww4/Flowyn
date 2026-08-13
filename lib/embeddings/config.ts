import { getEnv } from "@/lib/env";

export interface EmbeddingConfig {
  baseUrl: string;
  model: string;
  dimension: number;
  timeoutMs: number;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const env = getEnv();
  return Object.freeze({
    baseUrl: env.OLLAMA_BASE_URL.replace(/\/$/, ""),
    model: env.OLLAMA_EMBEDDING_MODEL,
    dimension: env.OLLAMA_EMBEDDING_DIMENSION,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  });
}

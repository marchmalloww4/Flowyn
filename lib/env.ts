import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).default("flowyn-local-development-secret-change-me"),
  DATABASE_URL: z.string().url().default("postgres://flowyn:flowyn@localhost:5432/flowyn"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("llama3.2:3b"),
  OLLAMA_EMBEDDING_MODEL: z.string().min(1).default("nomic-embed-text"),
  OLLAMA_EMBEDDING_DIMENSION: z.coerce.number().int().positive().max(4096).default(768),
  AI_PROVIDER: z.enum(["ollama"]).default("ollama"),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(4000).default(800),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(60000),
  MAX_GENERATION_PROMPT_CHARS: z.coerce.number().int().positive().max(100000).default(12000),
  KNOWLEDGE_CHUNK_SIZE: z.coerce.number().int().positive().max(10000).default(1200),
  KNOWLEDGE_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().max(5000).default(150),
  MAX_KNOWLEDGE_DOCUMENT_CHARS: z.coerce.number().int().positive().max(1000000).default(200000),
  RAG_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().max(50000).default(8000),
  RAG_TOP_K: z.coerce.number().int().positive().max(20).default(5),
  AGENT_MAX_STEPS_DEFAULT: z.coerce.number().int().positive().max(100).default(5),
  AGENT_MAX_STEPS_HARD_LIMIT: z.coerce.number().int().positive().max(100).default(12),
  AGENT_TOTAL_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(120000),
  AGENT_TOOL_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(15000),
  AGENT_MAX_GOAL_CHARS: z.coerce.number().int().positive().max(100000).default(4000),
  AGENT_MAX_OBSERVATION_CHARS: z.coerce.number().int().positive().max(100000).default(6000),
  AGENT_MAX_FINAL_RESPONSE_CHARS: z.coerce.number().int().positive().max(100000).default(8000),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}

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
  WORKFLOW_MAX_STEPS: z.coerce.number().int().positive().max(100).default(20),
  WORKFLOW_TOTAL_TIMEOUT_MS: z.coerce.number().int().positive().max(900000).default(300000),
  WORKFLOW_STEP_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(60000),
  WORKFLOW_MAX_RETRIES: z.coerce.number().int().nonnegative().max(5).default(2),
  WORKFLOW_MAX_INPUT_CHARS: z.coerce.number().int().positive().max(100000).default(12000),
  WORKFLOW_MAX_OUTPUT_CHARS: z.coerce.number().int().positive().max(100000).default(16000),
  WORKFLOW_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().max(200000).default(24000),
  WORKFLOW_DISPATCH_LEASE_MS: z.coerce.number().int().positive().max(300000).default(30000),
  WORKFLOW_EXECUTION_LEASE_MS: z.coerce.number().int().positive().max(600000).default(90000),
  WORKFLOW_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(32).default(1),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive().max(300000).default(5000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(25),
  SCHEDULER_HEARTBEAT_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(30),
  SCHEDULE_MISFIRE_GRACE_SECONDS: z.coerce.number().int().nonnegative().max(86400).default(60),
  SCHEDULE_MIN_INTERVAL_SECONDS: z.coerce.number().int().positive().max(31536000).default(60),
  SCHEDULE_MAX_INTERVAL_SECONDS: z.coerce.number().int().positive().max(31536000).default(31536000),
  WEBHOOK_SECRET_ENCRYPTION_KEY: z.string().min(1).default("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="),
  WEBHOOK_SECRET_KEY_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).default("v1"),
  WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().max(86400).default(300),
  WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().max(262144).default(262144),
  WEBHOOK_RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().max(100000).default(600),
  WEBHOOK_RATE_LIMIT_TRIGGER_PER_MINUTE: z.coerce.number().int().positive().max(100000).default(120),
  WEBHOOK_EVENT_RETENTION_DAYS: z.coerce.number().int().positive().max(365).default(30),
  WEBHOOK_PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
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

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
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(60000),
  MAX_GENERATION_PROMPT_CHARS: z.coerce.number().int().positive().max(100000).default(12000),
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
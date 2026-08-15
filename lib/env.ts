import { z } from "zod";
import { parseSecretKeyring } from "@/lib/security/keyring";

const booleanEnv = (defaultValue: boolean) => z.preprocess((value) => value === undefined ? defaultValue : value === true || value === "true", z.boolean());
const defaultIntegrationKeyring = JSON.stringify({ v1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" });
const defaultAiIdempotencyResponseKeyring = JSON.stringify({ v1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).default("flowyn-local-development-secret-change-me"),
  DATABASE_URL: z.string().url().default("postgres://flowyn:flowyn@localhost:5432/flowyn"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  PRODUCTION_PRIVATE_NETWORK: booleanEnv(false),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  DATABASE_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().positive().max(30).default(5),
  DATABASE_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().max(300).default(20),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().max(30000).default(3000),
  RUNTIME_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(30000),
  WORKER_INSTANCE_ID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
  SCHEDULER_INSTANCE_ID: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
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
  AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON: z.string().min(1).default(defaultAiIdempotencyResponseKeyring),
  AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).default("v1"),
  AI_IDEMPOTENCY_RESPONSE_MAX_CHARS: z.coerce.number().int().positive().max(64000).default(64000),
  AI_IDEMPOTENCY_RETENTION_DAYS: z.coerce.number().int().positive().max(30).default(7),
  AI_IDEMPOTENCY_STALE_AFTER_SECONDS: z.coerce.number().int().positive().max(86400).default(900),
  INTEGRATION_EGRESS_ENABLED: booleanEnv(false),
  INTEGRATION_CREDENTIAL_KEYRING_JSON: z.string().min(1).default(defaultIntegrationKeyring),
  INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).default("v1"),
  INTEGRATION_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  INTEGRATION_MAX_REQUEST_BYTES: z.coerce.number().int().min(1024).max(65536).default(16384),
  INTEGRATION_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(262144).default(65536),
}).superRefine((value, ctx) => {
  try {
    const keyring = parseSecretKeyring(value.INTEGRATION_CREDENTIAL_KEYRING_JSON);
    if (!keyring.has(value.INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION"], message: "The current integration credential key version is not present in the keyring." });
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["INTEGRATION_CREDENTIAL_KEYRING_JSON"], message: "The integration credential keyring is invalid." });
  }
  try {
    const keyring = parseSecretKeyring(value.AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON);
    if (!keyring.has(value.AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION"], message: "The current AI idempotency response key version is not present in the keyring." });
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON"], message: "The AI idempotency response keyring is invalid." });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= envSchema.parse(process.env);
  return cachedEnv;
}

export function getProductionConfigurationIssues(env: AppEnv = getEnv()): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (env.BETTER_AUTH_SECRET === "flowyn-local-development-secret-change-me") issues.push("BETTER_AUTH_SECRET");
  if (env.WEBHOOK_SECRET_ENCRYPTION_KEY === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") issues.push("WEBHOOK_SECRET_ENCRYPTION_KEY");
  if (env.INTEGRATION_CREDENTIAL_KEYRING_JSON === defaultIntegrationKeyring) issues.push("INTEGRATION_CREDENTIAL_KEYRING_JSON");
  if (env.AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON === defaultAiIdempotencyResponseKeyring) issues.push("AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON");
  return issues;
}

export type RuntimeRole = "app" | "worker" | "scheduler" | "migrator";

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.pathname === "/" && url.search === "" && url.hash === "";
  } catch {
    return false;
  }
}

function hasValidKey(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function hasSslMode(value: string, mode: string): boolean {
  try {
    return new URL(value).searchParams.get("sslmode") === mode;
  } catch {
    return false;
  }
}

export function getRuntimeConfigurationIssues(env: AppEnv, _role: RuntimeRole): string[] {
  if (env.NODE_ENV !== "production") return [];
  const issues = getProductionConfigurationIssues(env);

  if (!isExactHttpsOrigin(env.NEXT_PUBLIC_APP_URL)) issues.push("NEXT_PUBLIC_APP_URL");
  if (!isExactHttpsOrigin(env.WEBHOOK_PUBLIC_BASE_URL)) issues.push("WEBHOOK_PUBLIC_BASE_URL");

  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (trustedOrigins.length === 0 || !trustedOrigins.every(isExactHttpsOrigin) || !trustedOrigins.includes(env.NEXT_PUBLIC_APP_URL)) {
    issues.push("BETTER_AUTH_TRUSTED_ORIGINS");
  }

  try {
    const databaseUrl = new URL(env.DATABASE_URL);
    const privateDatabase = env.PRODUCTION_PRIVATE_NETWORK && databaseUrl.hostname === "postgres";
    if (isLocalHost(databaseUrl.hostname) || (!privateDatabase && hasSslMode(env.DATABASE_URL, "disable")) || (!privateDatabase && !hasSslMode(env.DATABASE_URL, "require") && !hasSslMode(env.DATABASE_URL, "verify-full"))) {
      issues.push("DATABASE_URL");
    }
  } catch {
    issues.push("DATABASE_URL");
  }

  try {
    const redisUrl = new URL(env.REDIS_URL);
    const privateRedis = env.PRODUCTION_PRIVATE_NETWORK && redisUrl.hostname === "redis";
    if (isLocalHost(redisUrl.hostname) || (!privateRedis && redisUrl.protocol !== "rediss:")) issues.push("REDIS_URL");
  } catch {
    issues.push("REDIS_URL");
  }

  try {
    const ollamaUrl = new URL(env.OLLAMA_BASE_URL);
    const privateOllama = env.PRODUCTION_PRIVATE_NETWORK && ollamaUrl.hostname === "ollama" && ollamaUrl.port === "11434";
    if (isLocalHost(ollamaUrl.hostname) || (!privateOllama && ollamaUrl.protocol !== "https:")) issues.push("OLLAMA_BASE_URL");
  } catch {
    issues.push("OLLAMA_BASE_URL");
  }

  if (!hasValidKey(env.WEBHOOK_SECRET_ENCRYPTION_KEY)) issues.push("WEBHOOK_SECRET_ENCRYPTION_KEY");
  try {
    const aiKeyring = parseSecretKeyring(env.AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON);
    if (!aiKeyring.has(env.AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION)) issues.push("AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION");
  } catch {
    issues.push("AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON");
  }

  if (env.AI_IDEMPOTENCY_RESPONSE_MAX_CHARS > 64000 || env.AI_IDEMPOTENCY_RETENTION_DAYS < 1) issues.push("AI_IDEMPOTENCY_POLICY");
  if (env.INTEGRATION_EGRESS_ENABLED !== true && env.INTEGRATION_EGRESS_ENABLED !== false) issues.push("INTEGRATION_EGRESS_ENABLED");
  if (_role === "migrator" && env.INTEGRATION_EGRESS_ENABLED) issues.push("INTEGRATION_EGRESS_ENABLED");
  if (env.DATABASE_POOL_MAX < 1 || env.DATABASE_CONNECT_TIMEOUT_SECONDS < 1 || env.DATABASE_IDLE_TIMEOUT_SECONDS < 1 || env.REDIS_CONNECT_TIMEOUT_MS < 100 || env.RUNTIME_SHUTDOWN_TIMEOUT_MS < 1000) issues.push("RUNTIME_LIMITS");

  return [...new Set(issues)];
}

export function assertRuntimeConfiguration(input: { role: RuntimeRole; env?: AppEnv }): void {
  const env = input.env ?? getEnv();
  const issues = getRuntimeConfigurationIssues(env, input.role);
  if (issues.length > 0) throw new Error(`Production configuration is invalid: ${issues.join(", ")}`);
}

export function assertProductionConfiguration(env: AppEnv = getEnv()): void {
  assertRuntimeConfiguration({ role: "app", env });
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}

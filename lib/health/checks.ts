import Redis from "ioredis";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import { getDatabaseClientOptions } from "@/lib/database/client";
import { getRedisConnectionOptions } from "@/lib/queue/connection";
import { HealthCheckError, type HealthResult } from "@/lib/health/types";

type Probe = () => Promise<void>;

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function errorCode(error: unknown, fallback: string): string {
  if (error instanceof HealthCheckError) return error.code;
  if (error instanceof Error && error.name === "AbortError") return "TIMEOUT";
  return fallback;
}

export async function runHealthCheck(service: string, probe: Probe): Promise<HealthResult> {
  const startedAt = performance.now();
  try {
    await probe();
    return { status: "ok", service, latencyMs: elapsed(startedAt) };
  } catch (error) {
    return { status: "error", service, latencyMs: elapsed(startedAt), errorCode: errorCode(error, "UNAVAILABLE") };
  }
}

export function evaluateOllamaModels(models: string[], configuredModel: string): void {
  if (!models.includes(configuredModel)) {
    throw new HealthCheckError("MODEL_MISSING", `Configured Ollama model is not installed: ${configuredModel}`);
  }
}

async function defaultPostgresProbe(): Promise<void> {
  const env = getEnv();
  const sql = postgres(env.DATABASE_URL, { ...getDatabaseClientOptions(env), max: 1 });
  try {
    await sql`select 1`;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function defaultRedisProbe(): Promise<void> {
  const env = getEnv();
  const client = new Redis(env.REDIS_URL, { ...getRedisConnectionOptions(env, "probe"), lazyConnect: true });
  try {
    await client.connect();
    if ((await client.ping()) !== "PONG") throw new HealthCheckError("PING_FAILED", "Redis did not return PONG");
  } finally {
    client.disconnect();
  }
}

async function defaultOllamaProbe(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getEnv().AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${getEnv().OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new HealthCheckError("HTTP_ERROR", `Ollama returned HTTP ${response.status}`);
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (payload.models ?? []).flatMap((model) => [model.name, model.model]).filter((name): name is string => Boolean(name));
    evaluateOllamaModels(models, getEnv().OLLAMA_MODEL);
  } finally {
    clearTimeout(timeout);
  }
}

export function checkPostgres(probe: Probe = defaultPostgresProbe): Promise<HealthResult> {
  return runHealthCheck("postgres", probe);
}

export function checkRedis(probe: Probe = defaultRedisProbe): Promise<HealthResult> {
  return runHealthCheck("redis", probe);
}

export function checkOllama(probe: Probe = defaultOllamaProbe): Promise<HealthResult> {
  return runHealthCheck("ollama", probe);
}

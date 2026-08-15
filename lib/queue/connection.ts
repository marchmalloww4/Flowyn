import Redis from "ioredis";
import { getEnv } from "@/lib/env";

let connection: Redis | undefined;

export function getRedisConnectionOptions(env: ReturnType<typeof getEnv> = getEnv(), mode: "worker" | "probe" = "worker") {
  const options = {
    maxRetriesPerRequest: mode === "worker" ? null : 1,
    enableReadyCheck: true,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
  } as const;
  return new URL(env.REDIS_URL).protocol === "rediss:"
    ? { ...options, tls: {} }
    : options;
}

export function createQueueWorkerConnection(): Redis {
  const env = getEnv();
  return new Redis(env.REDIS_URL, getRedisConnectionOptions(env, "worker"));
}

export function getQueueConnection(): Redis {
  const env = getEnv();
  connection ??= new Redis(env.REDIS_URL, getRedisConnectionOptions(env, "worker"));
  return connection;
}

export function createSchedulerConnection(): Redis {
  const env = getEnv();
  return new Redis(env.REDIS_URL, getRedisConnectionOptions(env, "probe"));
}

export async function closeQueueConnection(): Promise<void> {
  if (!connection) return;
  await connection.quit();
  connection = undefined;
}

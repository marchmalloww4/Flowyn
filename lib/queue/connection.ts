import Redis from "ioredis";
import { getEnv } from "@/lib/env";

let connection: Redis | undefined;

export function createQueueWorkerConnection(): Redis {
  return new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export function getQueueConnection(): Redis {
  connection ??= new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return connection;
}

export async function closeQueueConnection(): Promise<void> {
  if (!connection) return;
  await connection.quit();
  connection = undefined;
}

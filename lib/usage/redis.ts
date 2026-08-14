import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import type { WorkspaceRateLimitRedis } from "@/lib/usage/rate-limit";

let connection: Redis | undefined;

export function getUsageRateLimitRedis(): WorkspaceRateLimitRedis {
  connection ??= new Redis(getEnv().REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    connectTimeout: 3000,
  });
  return connection;
}

export async function closeUsageRateLimitRedis(): Promise<void> {
  if (!connection) return;
  await connection.quit();
  connection = undefined;
}

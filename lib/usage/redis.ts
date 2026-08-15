import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { getRedisConnectionOptions } from "@/lib/queue/connection";
import type { WorkspaceRateLimitRedis } from "@/lib/usage/rate-limit";

let connection: Redis | undefined;

export function getUsageRateLimitRedis(): WorkspaceRateLimitRedis {
  const env = getEnv();
  connection ??= new Redis(env.REDIS_URL, {
    ...getRedisConnectionOptions(env, "probe"),
    lazyConnect: true,
  });
  return connection;
}

export async function closeUsageRateLimitRedis(): Promise<void> {
  if (!connection) return;
  await connection.quit();
  connection = undefined;
}

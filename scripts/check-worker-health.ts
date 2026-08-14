import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { HEARTBEAT_KEY } from "@/lib/workflows/worker";

async function main() {
  const client = new Redis(getEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    await client.connect();
    const [workerId, ttl] = await Promise.all([client.get(HEARTBEAT_KEY), client.ttl(HEARTBEAT_KEY)]);
    if (!workerId || ttl <= 0) {
      console.error("Workflow worker heartbeat is missing or stale.");
      process.exitCode = 1;
    } else {
      console.log(`Workflow worker heartbeat is healthy: ${workerId} (${ttl}s remaining).`);
    }
  } catch (error) {
    console.error("Workflow worker heartbeat check failed.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
}

void main();

import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { SCHEDULER_HEARTBEAT_KEY } from "@/lib/schedules/scheduler";

async function main() {
  const client = new Redis(getEnv().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    await client.connect();
    const [schedulerId, ttl] = await Promise.all([client.get(SCHEDULER_HEARTBEAT_KEY), client.ttl(SCHEDULER_HEARTBEAT_KEY)]);
    if (!schedulerId || ttl <= 0) {
      console.error("Workflow scheduler heartbeat is missing or stale.");
      process.exitCode = 1;
    } else {
      console.log(`Workflow scheduler heartbeat is healthy: ${schedulerId} (${ttl}s remaining).`);
    }
  } catch (error) {
    console.error("Workflow scheduler heartbeat check failed.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
}

void main();

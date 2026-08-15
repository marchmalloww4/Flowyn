import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { HEARTBEAT_PREFIX, getWorkerHeartbeatKey } from "@/lib/workflows/worker";

async function main() {
  const env = getEnv();
  const client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS });
  try {
    await client.connect();
    const configuredKey = env.WORKER_INSTANCE_ID ? getWorkerHeartbeatKey(env.WORKER_INSTANCE_ID) : undefined;
    let keys: string[] = configuredKey ? [configuredKey] : [];
    if (!configuredKey) {
      let cursor = "0";
      do {
        const [nextCursor, batch] = await client.scan(cursor, "MATCH", `${HEARTBEAT_PREFIX}*`, "COUNT", "100");
        keys = [...keys, ...batch].slice(0, 100);
        cursor = nextCursor;
      } while (cursor !== "0" && keys.length < 100);
    }
    const statuses = await Promise.all(keys.map(async (key) => ({ key, workerId: await client.get(key), ttl: await client.ttl(key) })));
    const healthy = statuses.find((status) => status.workerId && status.ttl > 0);
    if (!healthy) {
      console.error("Workflow worker heartbeat is missing or stale.");
      process.exitCode = 1;
    } else {
      console.log(`Workflow worker heartbeat is healthy: ${healthy.workerId} (${healthy.ttl}s remaining).`);
    }
  } catch (error) {
    console.error("Workflow worker heartbeat check failed.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  } finally {
    client.disconnect();
  }
}

void main();

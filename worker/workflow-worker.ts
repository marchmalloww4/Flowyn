import { startWorkflowWorker } from "@/lib/workflows/worker";
import { startRuntime } from "@/lib/runtime/startup";
import { closeDatabase } from "@/lib/database";
import { closeQueueConnection } from "@/lib/queue/connection";
import { closeUsageRateLimitRedis } from "@/lib/usage/redis";

async function main() {
  const runtime = await startRuntime({ role: "worker", initializer: () => startWorkflowWorker() });
  const close = async () => {
    await runtime.close();
    await Promise.all([closeDatabase(), closeQueueConnection(), closeUsageRateLimitRedis()]);
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

void main().catch((error: unknown) => {
  console.error("Workflow worker failed to start.", error);
  process.exitCode = 1;
});

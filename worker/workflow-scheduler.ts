import { startWorkflowScheduler } from "@/lib/schedules/scheduler";
import { purgeExpiredWebhookEvents } from "@/lib/webhooks/repository";
import { expireWorkflowApprovals } from "@/lib/workflows/approval-service";
import { cleanupOperationalRetention } from "@/lib/usage/retention";
import { logError, logInfo } from "@/lib/observability/logger";
import { startRuntime } from "@/lib/runtime/startup";
import { closeDatabase } from "@/lib/database";
import { closeQueueConnection } from "@/lib/queue/connection";
import { closeUsageRateLimitRedis } from "@/lib/usage/redis";
import { recoverStaleAiIdempotency } from "@/lib/ai/idempotency-service";

async function main() {
  const runtime = await startRuntime({ role: "scheduler", initializer: () => startWorkflowScheduler({ cleanup: async () => {
    const [webhooks, approvals, staleAi, retention] = await Promise.all([purgeExpiredWebhookEvents(), expireWorkflowApprovals(), recoverStaleAiIdempotency(), cleanupOperationalRetention()]);
    logInfo("workflow_scheduler.maintenance_completed", { webhooks, approvals, staleAi, retention: retention.total });
    return webhooks + approvals + staleAi + retention.total;
  } }) });
  const close = async () => {
    await runtime.close();
    await Promise.all([closeDatabase(), closeQueueConnection(), closeUsageRateLimitRedis()]);
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

void main().catch((error: unknown) => {
  logError("workflow_scheduler.start_failed", error);
  process.exitCode = 1;
});

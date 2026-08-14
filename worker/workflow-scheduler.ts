import { startWorkflowScheduler } from "@/lib/schedules/scheduler";
import { purgeExpiredWebhookEvents } from "@/lib/webhooks/repository";
import { expireWorkflowApprovals } from "@/lib/workflows/approval-service";
import { cleanupOperationalRetention } from "@/lib/usage/retention";
import { logError, logInfo } from "@/lib/observability/logger";

async function main() {
  const runtime = await startWorkflowScheduler({ cleanup: async () => {
    const [webhooks, approvals, retention] = await Promise.all([purgeExpiredWebhookEvents(), expireWorkflowApprovals(), cleanupOperationalRetention()]);
    logInfo("workflow_scheduler.maintenance_completed", { webhooks, approvals, retention: retention.total });
    return webhooks + approvals + retention.total;
  } });
  const close = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

void main().catch((error: unknown) => {
  logError("workflow_scheduler.start_failed", error);
  process.exitCode = 1;
});

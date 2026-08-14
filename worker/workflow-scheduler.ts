import { startWorkflowScheduler } from "@/lib/schedules/scheduler";
import { purgeExpiredWebhookEvents } from "@/lib/webhooks/repository";
import { expireWorkflowApprovals } from "@/lib/workflows/approval-service";

async function main() {
  const runtime = await startWorkflowScheduler({ cleanup: async () => {
    const [webhooks, approvals] = await Promise.all([purgeExpiredWebhookEvents(), expireWorkflowApprovals()]);
    return webhooks + approvals;
  } });
  const close = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

void main().catch((error: unknown) => {
  console.error("Workflow scheduler failed to start.", error);
  process.exitCode = 1;
});

import { startWorkflowScheduler } from "@/lib/schedules/scheduler";
import { purgeExpiredWebhookEvents } from "@/lib/webhooks/repository";

async function main() {
  const runtime = await startWorkflowScheduler({ cleanup: () => purgeExpiredWebhookEvents() });
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

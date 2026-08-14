import { startWorkflowScheduler } from "@/lib/schedules/scheduler";

async function main() {
  const runtime = await startWorkflowScheduler();
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

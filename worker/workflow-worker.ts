import { startWorkflowWorker } from "@/lib/workflows/worker";

async function main() {
  const runtime = await startWorkflowWorker();
  const close = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}

void main().catch((error: unknown) => {
  console.error("Workflow worker failed to start.", error);
  process.exitCode = 1;
});

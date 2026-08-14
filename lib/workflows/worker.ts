import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { createQueueWorkerConnection } from "@/lib/queue/connection";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { WORKFLOW_QUEUE_NAME, type WorkflowJobData } from "@/lib/workflows/queue";
import type { WorkflowStepRegistry } from "@/lib/workflows/registry";
import { runWithCorrelationId } from "@/lib/observability/correlation";

const HEARTBEAT_KEY = "flowyn:worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 30;

export interface WorkflowWorkerOptions {
  workerId: string;
  concurrency: number;
  registry?: WorkflowStepRegistry;
}

export async function startWorkflowWorker(options: Partial<WorkflowWorkerOptions> = {}): Promise<{ close(): Promise<void> }> {
  const policy = getWorkflowExecutionPolicy();
  const workerId = options.workerId ?? `flowyn-worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const concurrency = options.concurrency ?? policy.workerConcurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error("Workflow worker concurrency is outside the allowed range.");
  const connection = createQueueWorkerConnection();
  const refreshHeartbeat = async () => {
    await connection.set(HEARTBEAT_KEY, workerId, "EX", HEARTBEAT_TTL_SECONDS);
  };
  await refreshHeartbeat();
  const worker = new Worker<WorkflowJobData>(WORKFLOW_QUEUE_NAME, async (job) => runWithCorrelationId(job.data.correlationId ?? randomUUID(), () => executeWorkflowRun({ runId: job.data.runId, workerId, registry: options.registry, ...(job.data.reservationId && job.data.reservationOwnerId ? { dispatchHandoff: { reservationId: job.data.reservationId, reservationOwnerId: job.data.reservationOwnerId, generation: job.data.generation ?? 0, correlationId: job.data.correlationId } } : {}) })), { connection, concurrency });
  const heartbeatTimer = setInterval(() => { void refreshHeartbeat().catch(() => undefined); }, Math.floor(HEARTBEAT_TTL_SECONDS * 1000 / 2));
  const dispatchTimer = setInterval(() => { void dispatchPendingWorkflowRuns({ dispatcherId: workerId }).catch(() => undefined); }, 5000);
  await dispatchPendingWorkflowRuns({ dispatcherId: workerId });
  return {
    async close() {
      clearInterval(heartbeatTimer);
      clearInterval(dispatchTimer);
      await worker.close();
      const current = await connection.get(HEARTBEAT_KEY);
      if (current === workerId) await connection.del(HEARTBEAT_KEY);
      await connection.quit();
    },
  };
}

export { HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS };

import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { createQueueWorkerConnection } from "@/lib/queue/connection";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { WORKFLOW_QUEUE_NAME, type WorkflowJobData } from "@/lib/workflows/queue";
import type { WorkflowStepRegistry } from "@/lib/workflows/registry";
import { runWithCorrelationId } from "@/lib/observability/correlation";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/observability/logger";

export const HEARTBEAT_PREFIX = "flowyn:worker:heartbeat:";
const HEARTBEAT_TTL_SECONDS = 30;

export function getWorkerHeartbeatKey(workerId: string): string {
  return `${HEARTBEAT_PREFIX}${workerId.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 64)}`;
}

export interface WorkflowWorkerOptions {
  workerId: string;
  concurrency: number;
  registry?: WorkflowStepRegistry;
}

export async function startWorkflowWorker(options: Partial<WorkflowWorkerOptions> = {}): Promise<{ close(): Promise<void> }> {
  const policy = getWorkflowExecutionPolicy();
  const workerId = options.workerId ?? getEnv().WORKER_INSTANCE_ID ?? `flowyn-worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const concurrency = options.concurrency ?? policy.workerConcurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error("Workflow worker concurrency is outside the allowed range.");
  const connection = createQueueWorkerConnection();
  const heartbeatKey = getWorkerHeartbeatKey(workerId);
  const refreshHeartbeat = async () => {
    await connection.set(heartbeatKey, workerId, "EX", HEARTBEAT_TTL_SECONDS);
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
      let drained = false;
      try {
        await Promise.race([worker.close(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Worker drain timed out.")), getEnv().RUNTIME_SHUTDOWN_TIMEOUT_MS))]);
        drained = true;
      } catch (error) {
        logError("workflow_worker.drain_failed", error, { workerId });
      }
      const current = await connection.get(heartbeatKey);
      if (drained && current === workerId) await connection.del(heartbeatKey);
      await connection.quit();
    },
  };
}

export { HEARTBEAT_TTL_SECONDS };

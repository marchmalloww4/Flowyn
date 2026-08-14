import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDatabase, type Database, workflowRunDispatches } from "@/lib/database";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { enqueueWorkflowRun } from "@/lib/workflows/queue";

export interface WorkflowDispatchResult {
  dispatched: number;
  failed: number;
}

export interface WorkflowDispatchOptions {
  db?: Database;
  enqueue?: (runId: string, generation?: number) => Promise<void>;
  dispatcherId?: string;
  limit?: number;
  now?: Date;
}

function safeDispatchError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Workflow dispatch failed.";
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500) || "Workflow dispatch failed.";
}

export async function dispatchPendingWorkflowRuns(options: WorkflowDispatchOptions = {}): Promise<WorkflowDispatchResult> {
  const db = options.db ?? getDatabase();
  const enqueue = options.enqueue ?? enqueueWorkflowRun;
  const dispatcherId = options.dispatcherId ?? `dispatcher-${process.pid}`;
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const now = options.now ?? new Date();
  const policy = getWorkflowExecutionPolicy();
  const leaseExpiresAt = new Date(now.getTime() + policy.dispatchLeaseMs);
  const retryReadyAt = new Date(now.getTime() - Math.min(30_000, 1_000 * 2 ** policy.maxRetries));
  const candidates = await db.select().from(workflowRunDispatches).where(or(
    eq(workflowRunDispatches.status, "PENDING"),
    and(eq(workflowRunDispatches.status, "FAILED"), lt(workflowRunDispatches.attempts, policy.maxRetries + 1), lt(workflowRunDispatches.updatedAt, retryReadyAt)),
    and(eq(workflowRunDispatches.status, "CLAIMED"), or(isNull(workflowRunDispatches.leaseExpiresAt), lt(workflowRunDispatches.leaseExpiresAt, now))),
  )).limit(limit);

  let dispatched = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const [claimed] = await db.update(workflowRunDispatches).set({
      status: "CLAIMED",
      dispatcherId,
      leaseExpiresAt,
      attempts: candidate.attempts + 1,
      updatedAt: now,
    }).where(and(
      eq(workflowRunDispatches.id, candidate.id),
      or(
        eq(workflowRunDispatches.status, "PENDING"),
        and(eq(workflowRunDispatches.status, "FAILED"), lt(workflowRunDispatches.attempts, policy.maxRetries + 1), lt(workflowRunDispatches.updatedAt, retryReadyAt)),
        and(eq(workflowRunDispatches.status, "CLAIMED"), or(isNull(workflowRunDispatches.leaseExpiresAt), lt(workflowRunDispatches.leaseExpiresAt, now))),
      ),
    )).returning();
    if (!claimed) continue;

    try {
      if ((candidate.dispatchGeneration ?? 0) === 0) await enqueue(candidate.runId);
      else await enqueue(candidate.runId, candidate.dispatchGeneration);
      await db.update(workflowRunDispatches).set({ status: "DISPATCHED", leaseExpiresAt: null, dispatchedAt: now, lastError: null, updatedAt: new Date() }).where(and(eq(workflowRunDispatches.id, candidate.id), eq(workflowRunDispatches.status, "CLAIMED"), eq(workflowRunDispatches.dispatcherId, dispatcherId)));
      dispatched += 1;
    } catch (error) {
      await db.update(workflowRunDispatches).set({ status: "FAILED", leaseExpiresAt: null, lastError: safeDispatchError(error), updatedAt: new Date() }).where(and(eq(workflowRunDispatches.id, candidate.id), eq(workflowRunDispatches.status, "CLAIMED"), eq(workflowRunDispatches.dispatcherId, dispatcherId)));
      failed += 1;
    }
  }
  return { dispatched, failed };
}

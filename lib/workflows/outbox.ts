import { and, eq, isNull, lte, lt, or, sql } from "drizzle-orm";
import { getDatabase, type Database, workflowRunDispatches, workflowRuns } from "@/lib/database";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { enqueueWorkflowRun } from "@/lib/workflows/queue";
import { acquireWorkspaceReservation, releaseWorkspaceReservation } from "@/lib/concurrency/service";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";

export interface WorkflowDispatchResult {
  dispatched: number;
  failed: number;
}

export interface WorkflowDispatchOptions {
  db?: Database;
  enqueue?: (runId: string, generation?: number, handoff?: { reservationId: string; reservationOwnerId: string; correlationId?: string | null }) => Promise<void>;
  reserve?: (input: { runId: string; generation: number; ownerId: string; now: Date }) => Promise<{ acquired: boolean; reservationId?: string; reservationOwnerId?: string; correlationId?: string | null; release?: () => Promise<void> }>;
  dispatcherId?: string;
  limit?: number;
  now?: Date;
}

export function workflowDeferralBackoffMs(deferCount: number): number {
  if (!Number.isInteger(deferCount) || deferCount < 0) throw new Error("Workflow deferral count must be a nonnegative integer.");
  return Math.min(30_000, 1_000 * 2 ** Math.min(deferCount, 5));
}

export async function recoverExpiredWorkflowDispatch(input: { runId: string; generation: number; now?: Date }, db: Database = getDatabase()): Promise<boolean> {
  const now = input.now ?? new Date();
  const [dispatch] = await db.select().from(workflowRunDispatches).where(eq(workflowRunDispatches.runId, input.runId)).limit(1);
  if (!dispatch || dispatch.status !== "DISPATCHED" || dispatch.dispatchGeneration !== input.generation) return false;
  const deferCount = (dispatch.deferCount ?? 0) + 1;
  const [recovered] = await db.update(workflowRunDispatches).set({
    status: "PENDING",
    dispatchGeneration: sql`${workflowRunDispatches.dispatchGeneration} + 1`,
    nextAttemptAt: new Date(now.getTime() + workflowDeferralBackoffMs(deferCount)),
    deferCount,
    deferReason: "WORKFLOW_HANDOFF_EXPIRED",
    dispatcherId: null,
    leaseExpiresAt: null,
    updatedAt: now,
  }).where(and(eq(workflowRunDispatches.runId, input.runId), eq(workflowRunDispatches.status, "DISPATCHED"), eq(workflowRunDispatches.dispatchGeneration, input.generation))).returning();
  return Boolean(recovered);
}

function safeDispatchError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Workflow dispatch failed.";
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500) || "Workflow dispatch failed.";
}

export async function dispatchPendingWorkflowRuns(options: WorkflowDispatchOptions = {}): Promise<WorkflowDispatchResult> {
  const db = options.db ?? getDatabase();
  const enqueue = options.enqueue ?? enqueueWorkflowRun;
  const reserve = options.reserve ?? (async (input: { runId: string; generation: number; ownerId: string; now: Date }) => {
    const [run] = await db.select({ workspaceId: workflowRuns.workspaceId, correlationId: workflowRuns.correlationId }).from(workflowRuns).where(eq(workflowRuns.id, input.runId)).limit(1);
    if (!run) throw new Error("Workflow run was not found for dispatch.");
    const policy = getWorkflowExecutionPolicy();
    const result = await acquireWorkspaceReservation({ workspaceId: run.workspaceId, operationClass: "WORKFLOW", sourceId: `${input.runId}.${input.generation}`, ownerId: input.ownerId, limit: getWorkspaceUsagePolicy(run.workspaceId).limits.concurrentWorkflows, leaseMs: Math.min(3_600_000, Math.max(1_000, policy.dispatchLeaseMs)), now: input.now, db }, db);
    if (!result.acquired || !result.reservation) return { acquired: false };
    return {
      acquired: true,
      reservationId: result.reservation.id,
      reservationOwnerId: input.ownerId,
      correlationId: run.correlationId,
      release: async () => { await releaseWorkspaceReservation({ reservationId: result.reservation!.id, workspaceId: run.workspaceId, ownerId: input.ownerId }, db); },
    };
  });
  const dispatcherId = options.dispatcherId ?? `dispatcher-${process.pid}`;
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const now = options.now ?? new Date();
  const policy = getWorkflowExecutionPolicy();
  const leaseExpiresAt = new Date(now.getTime() + policy.dispatchLeaseMs);
  const retryReadyAt = new Date(now.getTime() - Math.min(30_000, 1_000 * 2 ** policy.maxRetries));
  const ready = or(isNull(workflowRunDispatches.nextAttemptAt), lte(workflowRunDispatches.nextAttemptAt, now));
  const candidates = await db.select().from(workflowRunDispatches).where(or(
    and(eq(workflowRunDispatches.status, "PENDING"), ready),
    and(eq(workflowRunDispatches.status, "FAILED"), lt(workflowRunDispatches.attempts, policy.maxRetries + 1), lt(workflowRunDispatches.updatedAt, retryReadyAt), ready),
    and(eq(workflowRunDispatches.status, "CLAIMED"), or(isNull(workflowRunDispatches.leaseExpiresAt), lt(workflowRunDispatches.leaseExpiresAt, now)), ready),
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
        and(eq(workflowRunDispatches.status, "PENDING"), ready),
        and(eq(workflowRunDispatches.status, "FAILED"), lt(workflowRunDispatches.attempts, policy.maxRetries + 1), lt(workflowRunDispatches.updatedAt, retryReadyAt), ready),
        and(eq(workflowRunDispatches.status, "CLAIMED"), or(isNull(workflowRunDispatches.leaseExpiresAt), lt(workflowRunDispatches.leaseExpiresAt, now)), ready),
      ),
    )).returning();
    if (!claimed) continue;

    let reservation: { release?: () => Promise<void> } | undefined;
    try {
      const reserved = await reserve({ runId: candidate.runId, generation: candidate.dispatchGeneration ?? 0, ownerId: dispatcherId, now });
      if (!reserved.acquired) {
        const deferCount = (candidate.deferCount ?? 0) + 1;
        const nextAttemptAt = new Date(now.getTime() + workflowDeferralBackoffMs(deferCount));
        await db.update(workflowRunDispatches).set({
          status: "PENDING",
          attempts: candidate.attempts,
          leaseExpiresAt: null,
          nextAttemptAt,
          deferCount,
          deferReason: "WORKSPACE_CONCURRENCY",
          updatedAt: now,
        }).where(and(eq(workflowRunDispatches.id, candidate.id), eq(workflowRunDispatches.status, "CLAIMED"), eq(workflowRunDispatches.dispatcherId, dispatcherId)));
        continue;
      }
      reservation = { release: "release" in reserved ? reserved.release : undefined };
      const generation = candidate.dispatchGeneration ?? 0;
      if (reserved.reservationId) {
        const handoff = { reservationId: reserved.reservationId, reservationOwnerId: reserved.reservationOwnerId ?? dispatcherId, correlationId: reserved.correlationId };
        if (generation === 0) await enqueue(candidate.runId, undefined, handoff);
        else await enqueue(candidate.runId, generation, handoff);
      } else if (generation === 0) await enqueue(candidate.runId);
      else await enqueue(candidate.runId, generation);
      await db.update(workflowRunDispatches).set({ status: "DISPATCHED", leaseExpiresAt: null, nextAttemptAt: null, deferReason: null, dispatchedAt: now, lastError: null, updatedAt: new Date() }).where(and(eq(workflowRunDispatches.id, candidate.id), eq(workflowRunDispatches.status, "CLAIMED"), eq(workflowRunDispatches.dispatcherId, dispatcherId)));
      dispatched += 1;
    } catch (error) {
      if (reservation?.release) await reservation.release().catch(() => undefined);
      await db.update(workflowRunDispatches).set({ status: "FAILED", leaseExpiresAt: null, lastError: safeDispatchError(error), updatedAt: new Date() }).where(and(eq(workflowRunDispatches.id, candidate.id), eq(workflowRunDispatches.status, "CLAIMED"), eq(workflowRunDispatches.dispatcherId, dispatcherId)));
      failed += 1;
    }
  }
  return { dispatched, failed };
}

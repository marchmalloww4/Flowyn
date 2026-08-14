import { and, eq, gte, lte } from "drizzle-orm";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { getDatabase, agentRuns, integrationActionRuns, type Database, workflowRunDispatches, workflowRuns, workspaceConcurrencyStates, workspaceUsageBuckets } from "@/lib/database";
import { dayBucketStart, minuteBucketStart } from "@/lib/usage/admission";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";

function countStatuses(rows: Array<{ status: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
}

export interface WorkspaceUsageSummary {
  workspaceId: string;
  plan: "SELF_HOSTED";
  limits: ReturnType<typeof getWorkspaceUsagePolicy>["limits"];
  counters: Record<string, number>;
  concurrency: Record<string, number>;
  windows: { minuteStart: Date; dayStart: Date; now: Date };
  rateLimit: { status: "degraded"; source: "redis"; note: string };
}

export async function getWorkspaceUsageSummary(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<WorkspaceUsageSummary> {
  await requireWorkspaceAction(userId, workspaceId, "workspace.usage.read", db);
  const now = new Date();
  const dayStart = dayBucketStart(now);
  const minuteStart = minuteBucketStart(now);
  const buckets = await db.select({ metric: workspaceUsageBuckets.metric, bucketStart: workspaceUsageBuckets.bucketStart, consumed: workspaceUsageBuckets.consumed }).from(workspaceUsageBuckets).where(and(eq(workspaceUsageBuckets.workspaceId, workspaceId), gte(workspaceUsageBuckets.bucketStart, dayStart)));
  const states = await db.select({ operationClass: workspaceConcurrencyStates.operationClass, activeCount: workspaceConcurrencyStates.activeCount }).from(workspaceConcurrencyStates).where(eq(workspaceConcurrencyStates.workspaceId, workspaceId));
  const counters: Record<string, number> = {};
  for (const bucket of buckets) counters[`${bucket.metric}:${bucket.bucketStart.getTime() === minuteStart.getTime() ? "minute" : "day"}`] = bucket.consumed;
  return {
    workspaceId,
    plan: "SELF_HOSTED",
    limits: getWorkspaceUsagePolicy(workspaceId).limits,
    counters,
    concurrency: Object.fromEntries(states.map((state) => [state.operationClass, state.activeCount])),
    windows: { minuteStart, dayStart, now },
    rateLimit: { status: "degraded", source: "redis", note: "Short-window Redis counters are intentionally not authoritative in this projection." },
  };
}

export interface WorkspaceOperationsQuery {
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function getWorkspaceOperationsSummary(userId: string, workspaceId: string, query: WorkspaceOperationsQuery = {}, db: Database = getDatabase()) {
  await requireWorkspaceAction(userId, workspaceId, "workspace.operations.read", db);
  const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 50)));
  const from = query.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const to = query.to ?? new Date();
  const workflowRows = await db.select({ status: workflowRuns.status }).from(workflowRuns).where(and(eq(workflowRuns.workspaceId, workspaceId), gte(workflowRuns.createdAt, from), lte(workflowRuns.createdAt, to))).limit(limit);
  const agentRows = await db.select({ status: agentRuns.status }).from(agentRuns).where(and(eq(agentRuns.workspaceId, workspaceId), gte(agentRuns.createdAt, from), lte(agentRuns.createdAt, to))).limit(limit);
  const integrationRows = await db.select({ status: integrationActionRuns.status }).from(integrationActionRuns).where(and(eq(integrationActionRuns.workspaceId, workspaceId), gte(integrationActionRuns.createdAt, from), lte(integrationActionRuns.createdAt, to))).limit(limit);
  const dispatchRows = await db.select({ deferReason: workflowRunDispatches.deferReason }).from(workflowRunDispatches).innerJoin(workflowRuns, eq(workflowRunDispatches.runId, workflowRuns.id)).where(and(eq(workflowRuns.workspaceId, workspaceId), gte(workflowRunDispatches.updatedAt, from), lte(workflowRunDispatches.updatedAt, to))).limit(limit);
  return {
    workspaceId,
    window: { from, to, limit },
    workflowRuns: countStatuses(workflowRows),
    agentRuns: countStatuses(agentRows),
    integrationActions: countStatuses(integrationRows),
    deferredDispatches: dispatchRows.filter((row) => row.deferReason !== null).length,
  };
}

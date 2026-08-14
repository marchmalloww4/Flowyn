import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, type Database, workflowApprovalRequests, workflowRunDispatches, workflowRuns, workflowScheduleOccurrences, workflowStepRuns, workflowWebhookEvents, workflows, workspaceMembers } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { buildWorkflowApprovalSafeContext, canDecideWorkflowApproval, type WorkflowApprovalOrigin } from "@/lib/workflows/approvals";
import type { WorkflowApprovalRole } from "@/lib/workflows/types";
import { isWorkspaceRole } from "@/lib/workspaces/roles";
import { getCorrelationId } from "@/lib/observability/correlation";

export type WorkflowApprovalRequest = typeof workflowApprovalRequests.$inferSelect;

export interface PauseWorkflowForApprovalInput {
  runId: string;
  workspaceId: string;
  workflowId: string;
  workflowVersion: number;
  stepRunId: string;
  stepId: string;
  stepName: string;
  executionToken: string;
  requiredRole: WorkflowApprovalRole;
  expiresAfterSeconds?: number;
  review?: string | null;
  safeMetadata: Record<string, string | number | boolean | null>;
  completedStepTypes: string[];
}

export interface PausedWorkflowApproval {
  run: typeof workflowRuns.$inferSelect;
  request: WorkflowApprovalRequest;
}

export type WorkflowApprovalDecision = "approved" | "rejected";

async function resolveApprovalOrigin(runId: string, workspaceId: string, db: Database): Promise<WorkflowApprovalOrigin> {
  const [schedule] = await db.select({ id: workflowScheduleOccurrences.id })
    .from(workflowScheduleOccurrences)
    .where(and(eq(workflowScheduleOccurrences.workflowRunId, runId), eq(workflowScheduleOccurrences.workspaceId, workspaceId)))
    .limit(1);
  if (schedule) return "schedule";

  const [webhook] = await db.select({ id: workflowWebhookEvents.id })
    .from(workflowWebhookEvents)
    .where(and(eq(workflowWebhookEvents.workflowRunId, runId), eq(workflowWebhookEvents.workspaceId, workspaceId)))
    .limit(1);
  if (webhook) return "webhook";
  return "manual";
}

export async function pauseWorkflowForApproval(input: PauseWorkflowForApprovalInput, db: Database = getDatabase(), now = new Date()): Promise<PausedWorkflowApproval | null> {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(workflowRuns).where(and(
      eq(workflowRuns.id, input.runId),
      eq(workflowRuns.workspaceId, input.workspaceId),
      eq(workflowRuns.workflowId, input.workflowId),
      eq(workflowRuns.executionToken, input.executionToken),
      eq(workflowRuns.status, "RUNNING"),
      gt(workflowRuns.leaseExpiresAt, now),
    )).limit(1);
    if (!run) return null;

    const [workflow] = await tx.select({ name: workflows.name })
      .from(workflows)
      .where(and(eq(workflows.id, run.workflowId), eq(workflows.workspaceId, run.workspaceId)))
      .limit(1);
    if (!workflow) throw new AppError("WORKFLOW_NOT_FOUND", 404, "Workflow not found.");

    const [existing] = await tx.select().from(workflowApprovalRequests).where(and(
      eq(workflowApprovalRequests.workflowRunId, run.id),
      eq(workflowApprovalRequests.workflowStepId, input.stepId),
      eq(workflowApprovalRequests.workspaceId, run.workspaceId),
    )).limit(1);
    if (existing && existing.status !== "PENDING") throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The workflow approval request is no longer pending.");

    const origin = await resolveApprovalOrigin(run.id, run.workspaceId, tx);
    const expiresAt = input.expiresAfterSeconds === undefined ? null : new Date(now.getTime() + input.expiresAfterSeconds * 1000);
    const safeContext = buildWorkflowApprovalSafeContext({
      workflowName: workflow.name,
      workflowStepName: input.stepName,
      runId: run.id,
      workflowVersion: input.workflowVersion,
      requiredRole: input.requiredRole,
      origin,
      completedStepCount: input.completedStepTypes.length,
      completedStepTypes: input.completedStepTypes,
      review: input.review ?? undefined,
    });

    const request = existing ?? (await tx.insert(workflowApprovalRequests).values({
      workspaceId: run.workspaceId,
      workflowRunId: run.id,
      workflowStepId: input.stepId,
      workflowName: workflow.name,
      workflowStepName: input.stepName,
      workflowVersion: input.workflowVersion,
      requiredRole: input.requiredRole,
      status: "PENDING",
      safeContext,
      expiresAt,
    }).returning())[0];
    if (!request) throw new AppError("WORKFLOW_APPROVAL_CREATE_FAILED", 500, "The workflow approval request could not be created.");

    const [waitingStep] = await tx.update(workflowStepRuns).set({
      status: "WAITING_APPROVAL",
      safeMetadata: { ...input.safeMetadata, operation: "APPROVAL", requiredRole: input.requiredRole },
      completedAt: null,
      durationMs: null,
    }).where(and(
      eq(workflowStepRuns.id, input.stepRunId),
      eq(workflowStepRuns.workflowRunId, run.id),
      eq(workflowStepRuns.workspaceId, run.workspaceId),
      eq(workflowStepRuns.executionToken, input.executionToken),
      eq(workflowStepRuns.status, "RUNNING"),
    )).returning();
    if (!waitingStep) throw new AppError("WORKFLOW_STEP_STATE_INVALID", 409, "The workflow approval step is no longer active.");

    const [waitingRun] = await tx.update(workflowRuns).set({
      status: "WAITING_APPROVAL",
      executionToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(workflowRuns.id, run.id),
      eq(workflowRuns.executionToken, input.executionToken),
      eq(workflowRuns.status, "RUNNING"),
      gt(workflowRuns.leaseExpiresAt, now),
    )).returning();
    if (!waitingRun) throw new AppError("WORKFLOW_LEASE_LOST", 409, "The workflow execution lease was lost.");

    await recordAuditEvent({
      workspaceId: waitingRun.workspaceId,
      actorUserId: waitingRun.startedBy,
      action: "workflow_approval.created",
      resourceType: "workflow_approval",
      resourceId: request.id,
      metadata: {
        workflowRunId: waitingRun.id,
        workflowStepId: input.stepId,
        workflowName: workflow.name,
        workflowStepName: input.stepName,
        requiredRole: input.requiredRole,
        origin,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    }, tx);

    return { run: waitingRun, request };
  });
}

export async function listWorkflowApprovalRequests(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<WorkflowApprovalRequest[]> {
  await requireWorkspaceAction(userId, workspaceId, "workflow_approval.read", db);
  return db.select().from(workflowApprovalRequests)
    .where(eq(workflowApprovalRequests.workspaceId, workspaceId))
    .orderBy(desc(workflowApprovalRequests.createdAt));
}

export async function getWorkflowApprovalRequest(userId: string, requestId: string, db: Database = getDatabase()): Promise<WorkflowApprovalRequest> {
  const [request] = await db.select().from(workflowApprovalRequests).where(eq(workflowApprovalRequests.id, requestId)).limit(1);
  if (!request) throw new AppError("WORKFLOW_APPROVAL_NOT_FOUND", 404, "Workflow approval request not found.");
  await requireWorkspaceAction(userId, request.workspaceId, "workflow_approval.read", db);
  return request;
}

async function resetContinuationDispatch(tx: Database, runId: string, now: Date): Promise<void> {
  const [reset] = await tx.update(workflowRunDispatches).set({
    status: "PENDING",
    dispatchGeneration: sql`${workflowRunDispatches.dispatchGeneration} + 1`,
    attempts: 0,
    dispatcherId: null,
    leaseExpiresAt: null,
    lastError: null,
    dispatchedAt: null,
    updatedAt: now,
  }).where(eq(workflowRunDispatches.runId, runId)).returning();
  if (!reset) {
    await tx.insert(workflowRunDispatches).values({ runId, status: "PENDING", dispatchGeneration: 1, attempts: 0, correlationId: getCorrelationId(), updatedAt: now }).returning();
  }
}

async function finishApprovalInTransaction(tx: Database, request: WorkflowApprovalRequest, status: "APPROVED" | "REJECTED" | "EXPIRED", actorUserId: string | null, reason: string | null, now: Date): Promise<WorkflowApprovalRequest> {
  const [run] = await tx.select().from(workflowRuns).where(and(eq(workflowRuns.id, request.workflowRunId), eq(workflowRuns.workspaceId, request.workspaceId))).for("update").limit(1);
  if (!run) throw new AppError("WORKFLOW_APPROVAL_NOT_FOUND", 404, "Workflow approval request not found.");
  const approvalStep = run.definitionSnapshot.steps.find((step) => step.id === request.workflowStepId && step.type === "APPROVAL");
  if (!approvalStep || approvalStep.type !== "APPROVAL") throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The approval step is not present in the immutable workflow snapshot.");
  const [stepRun] = await tx.select().from(workflowStepRuns).where(and(
    eq(workflowStepRuns.workflowRunId, run.id),
    eq(workflowStepRuns.stepId, request.workflowStepId),
    eq(workflowStepRuns.status, "WAITING_APPROVAL"),
  )).orderBy(desc(workflowStepRuns.attempt)).for("update").limit(1);
  if (!stepRun) throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The approval step is not waiting for a decision.");

  const [updatedRequest] = await tx.update(workflowApprovalRequests).set({
    status,
    decidedAt: now,
    decidedBy: actorUserId,
    decisionReason: reason,
  }).where(and(eq(workflowApprovalRequests.id, request.id), eq(workflowApprovalRequests.status, "PENDING"))).returning();
  if (!updatedRequest) throw new AppError("WORKFLOW_APPROVAL_ALREADY_DECIDED", 409, "The workflow approval request has already been decided.");

  if (status === "APPROVED") {
    const output = { decision: "approved" } as const;
    await tx.update(workflowStepRuns).set({
      status: "SUCCEEDED",
      safeOutput: output,
      safeMetadata: { ...stepRun.safeMetadata, operation: "APPROVAL", decision: "approved" },
      completedAt: now,
      durationMs: 0,
    }).where(eq(workflowStepRuns.id, stepRun.id));
    const [queued] = await tx.update(workflowRuns).set({
      status: "QUEUED",
      currentStepId: approvalStep.nextStepId ?? null,
      output,
      errorCode: null,
      executionToken: null,
      leaseExpiresAt: null,
      completedAt: null,
      updatedAt: now,
    }).where(and(eq(workflowRuns.id, run.id), eq(workflowRuns.status, "WAITING_APPROVAL"))).returning();
    if (!queued) throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The workflow run is no longer waiting for approval.");
    await resetContinuationDispatch(tx, run.id, now);
  } else {
    const [failedStep] = await tx.update(workflowStepRuns).set({
      status: "FAILED",
      errorCode: status === "REJECTED" ? "WORKFLOW_APPROVAL_REJECTED" : "WORKFLOW_APPROVAL_EXPIRED",
      safeMetadata: { ...stepRun.safeMetadata, operation: "APPROVAL", decision: status.toLowerCase() },
      completedAt: now,
      durationMs: 0,
    }).where(eq(workflowStepRuns.id, stepRun.id)).returning();
    if (!failedStep) throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The approval step could not be finalized.");
    const [terminal] = await tx.update(workflowRuns).set({
      status,
      errorCode: status === "REJECTED" ? "WORKFLOW_APPROVAL_REJECTED" : "WORKFLOW_APPROVAL_EXPIRED",
      executionToken: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    }).where(and(eq(workflowRuns.id, run.id), eq(workflowRuns.status, "WAITING_APPROVAL"))).returning();
    if (!terminal) throw new AppError("WORKFLOW_APPROVAL_STATE_INVALID", 409, "The workflow run is no longer waiting for approval.");
  }

  await recordAuditEvent({
    workspaceId: request.workspaceId,
    actorUserId,
    action: status === "APPROVED" ? "workflow_approval.approved" : status === "REJECTED" ? "workflow_approval.rejected" : "workflow_approval.expired",
    resourceType: "workflow_approval",
    resourceId: request.id,
    metadata: { workflowRunId: request.workflowRunId, workflowStepId: request.workflowStepId, status, reason },
  }, tx);
  return updatedRequest;
}

export async function decideWorkflowApproval(userId: string, requestId: string, decision: WorkflowApprovalDecision, reason: string | null = null, db: Database = getDatabase(), now = new Date()): Promise<WorkflowApprovalRequest> {
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(workflowApprovalRequests).where(eq(workflowApprovalRequests.id, requestId)).for("update").limit(1);
    if (!request) throw new AppError("WORKFLOW_APPROVAL_NOT_FOUND", 404, "Workflow approval request not found.");
    await requireWorkspaceAction(userId, request.workspaceId, "workflow_approval.decide", tx);
    const [membership] = await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, request.workspaceId), eq(workspaceMembers.userId, userId))).for("update").limit(1);
    if (!membership || !isWorkspaceRole(membership.role)) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    if (!canDecideWorkflowApproval(request.requiredRole, membership.role)) throw new AppError("WORKFLOW_APPROVAL_FORBIDDEN", 403, "You do not satisfy the approval role requirement.");
    if (request.status === "APPROVED" && decision === "approved") return { expired: false as const, request };
    if (request.status === "REJECTED" && decision === "rejected") return { expired: false as const, request };
    if (request.status !== "PENDING") throw new AppError(request.status === "EXPIRED" ? "WORKFLOW_APPROVAL_EXPIRED" : "WORKFLOW_APPROVAL_ALREADY_DECIDED", 409, "The workflow approval request is no longer pending.");
    if (request.expiresAt && request.expiresAt <= now) {
      return { expired: true as const, request: await finishApprovalInTransaction(tx, request, "EXPIRED", null, "APPROVAL_EXPIRED", now) };
    }
    return { expired: false as const, request: await finishApprovalInTransaction(tx, request, decision === "approved" ? "APPROVED" : "REJECTED", userId, reason?.slice(0, 500) ?? null, now) };
  });
  if (result.expired) throw new AppError("WORKFLOW_APPROVAL_EXPIRED", 409, "The workflow approval request has expired.");
  return result.request;
}

export async function expireWorkflowApprovals(db: Database = getDatabase(), now = new Date(), limit = 50): Promise<number> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const candidates = await db.select({ id: workflowApprovalRequests.id }).from(workflowApprovalRequests)
    .where(and(eq(workflowApprovalRequests.status, "PENDING"), lte(workflowApprovalRequests.expiresAt, now)))
    .limit(boundedLimit);
  let expired = 0;
  for (const candidate of candidates) {
    const changed = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(workflowApprovalRequests).where(eq(workflowApprovalRequests.id, candidate.id)).for("update").limit(1);
      if (!request || request.status !== "PENDING" || !request.expiresAt || request.expiresAt > now) return false;
      await finishApprovalInTransaction(tx, request, "EXPIRED", null, "APPROVAL_EXPIRED", now);
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

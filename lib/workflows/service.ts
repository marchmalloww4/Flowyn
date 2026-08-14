import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, inArray, lt, or } from "drizzle-orm";
import { getAgent, getAgentForWorkspace } from "@/lib/agents/service";
import { getBrand, getBrandForWorkspace } from "@/lib/brands/service";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, type Database, workflowRunDispatches, workflowRuns, workflowScheduleOccurrences, workflowStepRuns, workflowVersions, workflows } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { userExecutionPrincipal, workspaceAutomationPrincipal, type ExecutionPrincipal, type WorkspaceAutomationPrincipal } from "@/lib/security/principal";
import { validateWorkflowDefinition } from "@/lib/workflows/validation";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import type { JsonValue, WorkflowDefinition } from "@/lib/workflows/types";
import { workflowCreateSchema, workflowPatchSchema, workflowRunSchema, type WorkflowCreateInput, type WorkflowPatchInput } from "@/lib/workflows/validation";

export type WorkflowDefinitionRecord = typeof workflows.$inferSelect;
export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowStepRun = typeof workflowStepRuns.$inferSelect;

export interface WorkflowRunHistory {
  run: WorkflowRun;
  steps: WorkflowStepRun[];
}

export interface WorkflowRunLease {
  run: WorkflowRun;
  executionToken: string;
}

export interface WorkflowStepAttemptInput {
  runId: string;
  workspaceId: string;
  stepId: string;
  stepType: WorkflowStepRun["stepType"];
  executionToken: string;
  safeInput: JsonValue;
  attempt: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableValue(nested)]));
  return value;
}

function hashDefinition(definition: WorkflowDefinition): string {
  return createHash("sha256").update(JSON.stringify(stableValue(definition))).digest("hex");
}

function resourceNotFound(): AppError {
  return new AppError("WORKFLOW_NOT_FOUND", 404, "Workflow not found.");
}

async function validateReferencedResourcesForPrincipal(principal: ExecutionPrincipal, workspaceId: string, definition: WorkflowDefinition, db: Database, requireUsable: boolean): Promise<void> {
  for (const step of definition.steps) {
    if (step.type === "AGENT") {
      const agent = principal.kind === "workspace_automation"
        ? await getAgentForWorkspace(workspaceId, step.config.agentId, db)
        : await getAgent(principal.userId, step.config.agentId, db);
      if (agent.workspaceId !== workspaceId) throw resourceNotFound();
      if (requireUsable && !agent.enabled) throw new AppError("WORKFLOW_AGENT_NOT_ALLOWED", 409, "The referenced agent is disabled.");
    }
    if ((step.type === "AI_GENERATE" || step.type === "AGENT") && "brandId" in step.config && step.config.brandId) {
      const brand = principal.kind === "workspace_automation"
        ? await getBrandForWorkspace(workspaceId, step.config.brandId, db)
        : await getBrand(principal.userId, step.config.brandId, db);
      if (brand.workspaceId !== workspaceId) throw resourceNotFound();
    }
  }
}

async function validateReferencedResources(userId: string, workspaceId: string, definition: WorkflowDefinition, db: Database, requireUsable: boolean): Promise<void> {
  await validateReferencedResourcesForPrincipal(userExecutionPrincipal(userId), workspaceId, definition, db, requireUsable);
}

async function loadWorkflow(userId: string, workflowId: string, db: Database, includeDeleted = false): Promise<WorkflowDefinitionRecord> {
  const conditions = [eq(workflows.id, workflowId)];
  if (!includeDeleted) conditions.push(isNull(workflows.deletedAt));
  const [workflow] = await db.select().from(workflows).where(and(...conditions)).limit(1);
  if (!workflow) throw resourceNotFound();
  await requireWorkspaceMember(userId, workflow.workspaceId, db);
  return workflow;
}

async function loadWorkflowForWorkspace(workspaceId: string, workflowId: string, db: Database, includeDeleted = false): Promise<WorkflowDefinitionRecord> {
  const conditions = [eq(workflows.id, workflowId), eq(workflows.workspaceId, workspaceId)];
  if (!includeDeleted) conditions.push(isNull(workflows.deletedAt));
  const [workflow] = await db.select().from(workflows).where(and(...conditions)).limit(1);
  if (!workflow) throw resourceNotFound();
  return workflow;
}

async function loadVersion(workflow: WorkflowDefinitionRecord, db: Database): Promise<WorkflowVersion> {
  const [version] = await db.select().from(workflowVersions).where(and(eq(workflowVersions.workflowId, workflow.id), eq(workflowVersions.version, workflow.currentVersion))).limit(1);
  if (!version) throw new AppError("WORKFLOW_INVALID_DEFINITION", 500, "The workflow current version is missing.");
  return version;
}

export async function createWorkflow(userId: string, input: WorkflowCreateInput, db: Database = getDatabase()): Promise<WorkflowDefinitionRecord> {
  const parsed = workflowCreateSchema.parse(input);
  const definition = validateWorkflowDefinition(parsed.definition);
  await requireWorkspaceAction(userId, parsed.workspaceId, "workflow.write", db);
  if (parsed.enabled) await validateReferencedResources(userId, parsed.workspaceId, definition, db, false);
  const hash = hashDefinition(definition);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(workflows).values({ workspaceId: parsed.workspaceId, name: parsed.name, description: parsed.description, enabled: parsed.enabled, currentVersion: 1, createdBy: userId }).returning();
    if (!created) throw new AppError("WORKFLOW_CREATE_FAILED", 500, "Workflow could not be created.");
    const [version] = await tx.insert(workflowVersions).values({ workflowId: created.id, workspaceId: created.workspaceId, version: 1, definition, definitionHash: hash, createdBy: userId }).returning();
    if (!version) throw new AppError("WORKFLOW_VERSION_CREATE_FAILED", 500, "Workflow version could not be created.");
    const [updated] = await tx.update(workflows).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(workflows.id, created.id)).returning();
    if (!updated) throw new AppError("WORKFLOW_CREATE_FAILED", 500, "Workflow could not be finalized.");
    await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "workflow.created", resourceType: "workflow", resourceId: updated.id, metadata: { name: updated.name, version: 1 } }, tx);
    return updated;
  });
}

export async function listWorkflows(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<WorkflowDefinitionRecord[]> {
  await requireWorkspaceMember(userId, workspaceId, db);
  return db.select().from(workflows).where(and(eq(workflows.workspaceId, workspaceId), isNull(workflows.deletedAt))).orderBy(desc(workflows.updatedAt));
}

export async function getWorkflow(userId: string, workflowId: string, db: Database = getDatabase()): Promise<WorkflowDefinitionRecord> {
  return loadWorkflow(userId, workflowId, db);
}

export async function updateWorkflow(userId: string, workflowId: string, input: WorkflowPatchInput, db: Database = getDatabase()): Promise<WorkflowDefinitionRecord> {
  const existing = await loadWorkflow(userId, workflowId, db);
  const parsed = workflowPatchSchema.parse(input);
  const definition = parsed.definition ? validateWorkflowDefinition(parsed.definition) : undefined;
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow.write", db);
  if (parsed.enabled && definition) await validateReferencedResources(userId, existing.workspaceId, definition, db, false);
  return db.transaction(async (tx) => {
    let currentVersionId = existing.currentVersionId;
    let currentVersion = existing.currentVersion;
    if (definition) {
      currentVersion += 1;
      const [version] = await tx.insert(workflowVersions).values({ workflowId: existing.id, workspaceId: existing.workspaceId, version: currentVersion, definition, definitionHash: hashDefinition(definition), createdBy: userId }).returning();
      if (!version) throw new AppError("WORKFLOW_VERSION_CREATE_FAILED", 500, "Workflow version could not be created.");
      currentVersionId = version.id;
    }
    const [updated] = await tx.update(workflows).set({
      ...(parsed.name === undefined ? {} : { name: parsed.name }),
      ...(parsed.description === undefined ? {} : { description: parsed.description }),
      ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
      ...(definition ? { currentVersion, currentVersionId } : {}),
      updatedAt: new Date(),
    }).where(and(eq(workflows.id, existing.id), isNull(workflows.deletedAt))).returning();
    if (!updated) throw new AppError("WORKFLOW_UPDATE_FAILED", 500, "Workflow could not be updated.");
    await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "workflow.updated", resourceType: "workflow", resourceId: updated.id, metadata: { fields: Object.keys(parsed), version: updated.currentVersion } }, tx);
    if (parsed.enabled !== undefined) await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: parsed.enabled ? "workflow.enabled" : "workflow.disabled", resourceType: "workflow", resourceId: updated.id, metadata: { enabled: parsed.enabled } }, tx);
    return updated;
  });
}

export async function deleteWorkflow(userId: string, workflowId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await loadWorkflow(userId, workflowId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow.delete", db);
  await db.transaction(async (tx) => {
    const [deleted] = await tx.update(workflows).set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(workflows.id, existing.id), isNull(workflows.deletedAt))).returning();
    if (!deleted) throw new AppError("WORKFLOW_DELETE_FAILED", 500, "Workflow could not be deleted.");
    await recordAuditEvent({ workspaceId: deleted.workspaceId, actorUserId: userId, action: "workflow.deleted", resourceType: "workflow", resourceId: deleted.id, metadata: { name: deleted.name } }, tx);
  });
}

export async function createWorkflowRun(userId: string, workflowId: string, input: JsonValue, idempotencyKey?: string, db: Database = getDatabase()): Promise<WorkflowRun> {
  const workflow = await loadWorkflow(userId, workflowId, db);
  await requireWorkspaceAction(userId, workflow.workspaceId, "workflow.run", db);
  const parsedInput = workflowRunSchema.parse({ input }).input as JsonValue;
  if (idempotencyKey !== undefined && (idempotencyKey.trim().length < 1 || idempotencyKey.length > 120)) throw new AppError("WORKFLOW_IDEMPOTENCY_CONFLICT", 400, "The workflow idempotency key is invalid.");
  if (idempotencyKey) {
    const [existing] = await db.select().from(workflowRuns).where(and(eq(workflowRuns.workspaceId, workflow.workspaceId), eq(workflowRuns.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      if (existing.workflowId !== workflow.id) throw new AppError("WORKFLOW_IDEMPOTENCY_CONFLICT", 409, "The idempotency key is already used for another workflow.");
      return existing;
    }
  }
  if (!workflow.enabled) throw new AppError("WORKFLOW_DISABLED", 409, "The workflow is disabled.");
  const version = await loadVersion(workflow, db);
  const definition = validateWorkflowDefinition(version.definition);
  await validateReferencedResources(userId, workflow.workspaceId, definition, db, true);
  const policy = getWorkflowExecutionPolicy();
  if (JSON.stringify(parsedInput).length > policy.maxInputChars) throw new AppError("WORKFLOW_CONTEXT_LIMIT", 400, "Workflow input exceeds the configured limit.");
  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      const [existing] = await tx.select().from(workflowRuns).where(and(eq(workflowRuns.workspaceId, workflow.workspaceId), eq(workflowRuns.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) {
        if (existing.workflowId !== workflow.id) throw new AppError("WORKFLOW_IDEMPOTENCY_CONFLICT", 409, "The idempotency key is already used for another workflow.");
        return existing;
      }
    }
    const insert = tx.insert(workflowRuns).values({ workspaceId: workflow.workspaceId, workflowId: workflow.id, workflowVersion: version.version, workflowVersionId: version.id, definitionSnapshot: definition, status: "QUEUED", startedBy: userId, input: parsedInput, currentStepId: definition.entryStepId, idempotencyKey: idempotencyKey ?? null });
    const [run] = await (idempotencyKey ? insert.onConflictDoNothing({ target: [workflowRuns.workspaceId, workflowRuns.idempotencyKey] }) : insert).returning();
    if (!run && idempotencyKey) {
      const [existing] = await tx.select().from(workflowRuns).where(and(eq(workflowRuns.workspaceId, workflow.workspaceId), eq(workflowRuns.idempotencyKey, idempotencyKey))).limit(1);
      if (existing) return existing;
    }
    if (!run) throw new AppError("WORKFLOW_RUN_CREATE_FAILED", 500, "Workflow run could not be created.");
    await tx.insert(workflowRunDispatches).values({ runId: run.id, status: "PENDING", attempts: 0 }).returning();
    await recordAuditEvent({ workspaceId: run.workspaceId, actorUserId: userId, action: "workflow.run_queued", resourceType: "workflow_run", resourceId: run.id, metadata: { workflowId: workflow.id, version: version.version } }, tx);
    return run;
  });
}

export interface ScheduledWorkflowRunInput {
  principal: WorkspaceAutomationPrincipal;
  scheduleId: string;
  occurrenceId: string;
  workspaceId: string;
  workflowId: string;
  input: JsonValue;
  idempotencyKey: string;
}

export async function createScheduledWorkflowRun(input: ScheduledWorkflowRunInput, db: Database = getDatabase()): Promise<WorkflowRun> {
  if (input.principal.workspaceId !== input.workspaceId || input.principal.scheduleId !== input.scheduleId) {
    throw new AppError("WORKFLOW_PRINCIPAL_INVALID", 500, "The scheduled workflow principal is out of scope.");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 120) {
    throw new AppError("WORKFLOW_IDEMPOTENCY_CONFLICT", 400, "The workflow idempotency key is invalid.");
  }
  const workflow = await loadWorkflowForWorkspace(input.workspaceId, input.workflowId, db);
  if (!workflow.enabled) throw new AppError("WORKFLOW_DISABLED", 409, "The workflow is disabled.");
  const parsedInput = workflowRunSchema.parse({ input: input.input }).input as JsonValue;
  const version = await loadVersion(workflow, db);
  const definition = validateWorkflowDefinition(version.definition);
  await validateReferencedResourcesForPrincipal(input.principal, input.workspaceId, definition, db, true);
  if (JSON.stringify(parsedInput).length > getWorkflowExecutionPolicy().maxInputChars) {
    throw new AppError("WORKFLOW_CONTEXT_LIMIT", 400, "Workflow input exceeds the configured limit.");
  }
  const [existing] = await db.select().from(workflowRuns).where(and(eq(workflowRuns.workspaceId, input.workspaceId), eq(workflowRuns.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing) {
    if (existing.workflowId !== input.workflowId) throw new AppError("WORKFLOW_IDEMPOTENCY_CONFLICT", 409, "The idempotency key is already used for another workflow.");
    return existing;
  }
  const insert = db.insert(workflowRuns).values({
    workspaceId: input.workspaceId,
    workflowId: workflow.id,
    workflowVersion: version.version,
    workflowVersionId: version.id,
    definitionSnapshot: definition,
    status: "QUEUED",
    startedBy: null,
    input: parsedInput,
    currentStepId: definition.entryStepId,
    idempotencyKey: input.idempotencyKey,
  });
  const [run] = await insert.onConflictDoNothing({ target: [workflowRuns.workspaceId, workflowRuns.idempotencyKey] }).returning();
  if (!run) {
    const [duplicate] = await db.select().from(workflowRuns).where(and(eq(workflowRuns.workspaceId, input.workspaceId), eq(workflowRuns.idempotencyKey, input.idempotencyKey))).limit(1);
    if (duplicate) return duplicate;
    throw new AppError("WORKFLOW_RUN_CREATE_FAILED", 500, "Workflow run could not be created.");
  }
  await db.insert(workflowRunDispatches).values({ runId: run.id, status: "PENDING", attempts: 0 }).returning();
  await recordAuditEvent({ workspaceId: run.workspaceId, actorUserId: null, action: "workflow.run_queued", resourceType: "workflow_run", resourceId: run.id, metadata: { workflowId: workflow.id, version: version.version, scheduleId: input.scheduleId, occurrenceId: input.occurrenceId, principalKind: input.principal.kind } }, db);
  return run;
}

export async function getWorkflowRun(userId: string, runId: string, db: Database = getDatabase()): Promise<WorkflowRunHistory> {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
  if (!run) throw new AppError("WORKFLOW_NOT_FOUND", 404, "Workflow run not found.");
  await requireWorkspaceMember(userId, run.workspaceId, db);
  const steps = await db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, run.id)).orderBy(asc(workflowStepRuns.startedAt), asc(workflowStepRuns.id));
  return { run, steps };
}

export async function getWorkflowRunRecord(runId: string, db: Database = getDatabase()): Promise<WorkflowRun | null> {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
  return run ?? null;
}

export async function resolveWorkflowRunPrincipal(run: WorkflowRun, db: Database = getDatabase()): Promise<ExecutionPrincipal> {
  if (run.startedBy) return userExecutionPrincipal(run.startedBy);
  const [occurrence] = await db.select({ scheduleId: workflowScheduleOccurrences.scheduleId, workspaceId: workflowScheduleOccurrences.workspaceId })
    .from(workflowScheduleOccurrences)
    .where(and(eq(workflowScheduleOccurrences.workflowRunId, run.id), eq(workflowScheduleOccurrences.workspaceId, run.workspaceId)))
    .limit(1);
  if (!occurrence) throw new AppError("WORKFLOW_PRINCIPAL_MISSING", 500, "The scheduled workflow run has no execution principal.");
  return workspaceAutomationPrincipal(occurrence.workspaceId, occurrence.scheduleId);
}

export async function cancelWorkflowRun(userId: string, runId: string, db: Database = getDatabase()): Promise<WorkflowRun> {
  const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
  if (!run) throw new AppError("WORKFLOW_NOT_FOUND", 404, "Workflow run not found.");
  const membership = await requireWorkspaceMember(userId, run.workspaceId, db);
  if (membership.role === "MEMBER" && run.startedBy !== userId) throw new AppError("WORKFLOW_CANCEL_FORBIDDEN", 403, "You cannot cancel this workflow run.");
  if (!["QUEUED", "RUNNING"].includes(run.status)) return run;
  const [updated] = await db.update(workflowRuns).set({ status: "CANCEL_REQUESTED", cancelRequestedAt: new Date(), updatedAt: new Date() }).where(and(eq(workflowRuns.id, run.id), inArray(workflowRuns.status, ["QUEUED", "RUNNING"]))).returning();
  const result = updated ?? run;
  await recordAuditEvent({ workspaceId: result.workspaceId, actorUserId: userId, action: "workflow.run_cancel_requested", resourceType: "workflow_run", resourceId: result.id, metadata: { previousStatus: run.status } }, db);
  return result;
}

export async function claimWorkflowRun(runId: string, workerId: string, db: Database = getDatabase(), now = new Date()): Promise<WorkflowRunLease | null> {
  const [current] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
  if (!current) return null;
  const stale = current.status === "RUNNING" && (!current.leaseExpiresAt || current.leaseExpiresAt <= now);
  if (current.status !== "QUEUED" && !stale) return null;
  if (stale && current.executionToken) {
    await db.update(workflowStepRuns).set({ status: "INTERRUPTED", completedAt: now, errorCode: "WORKFLOW_LEASE_EXPIRED" }).where(and(eq(workflowStepRuns.workflowRunId, runId), eq(workflowStepRuns.executionToken, current.executionToken), eq(workflowStepRuns.status, "RUNNING")));
  }
  const executionToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + getWorkflowExecutionPolicy().executionLeaseMs);
  const [claimed] = await db.update(workflowRuns).set({ status: "RUNNING", executionToken, leaseExpiresAt, startedAt: current.startedAt ?? now, updatedAt: now }).where(and(
    eq(workflowRuns.id, runId),
    or(eq(workflowRuns.status, "QUEUED"), and(eq(workflowRuns.status, "RUNNING"), or(isNull(workflowRuns.leaseExpiresAt), lt(workflowRuns.leaseExpiresAt, now)))),
  )).returning();
  if (!claimed) return null;
  void workerId;
  return { run: claimed, executionToken };
}

export async function renewWorkflowRunLease(runId: string, executionToken: string, db: Database = getDatabase(), now = new Date()): Promise<boolean> {
  const leaseExpiresAt = new Date(now.getTime() + getWorkflowExecutionPolicy().executionLeaseMs);
  const [renewed] = await db.update(workflowRuns).set({ leaseExpiresAt, updatedAt: now }).where(and(eq(workflowRuns.id, runId), eq(workflowRuns.executionToken, executionToken), eq(workflowRuns.status, "RUNNING"), gt(workflowRuns.leaseExpiresAt, now))).returning();
  return Boolean(renewed);
}

export async function createWorkflowStepAttempt(input: WorkflowStepAttemptInput, db: Database = getDatabase()): Promise<WorkflowStepRun> {
  const [latest] = await db.select().from(workflowStepRuns).where(and(eq(workflowStepRuns.workflowRunId, input.runId), eq(workflowStepRuns.stepId, input.stepId))).orderBy(desc(workflowStepRuns.attempt)).limit(1);
  const attempt = Math.max(input.attempt, (latest?.attempt ?? 0) + 1);
  const [created] = await db.insert(workflowStepRuns).values({ workflowRunId: input.runId, workspaceId: input.workspaceId, stepId: input.stepId, stepType: input.stepType, executionToken: input.executionToken, attempt, status: "RUNNING", safeInput: input.safeInput, safeMetadata: {} }).returning();
  if (!created) throw new AppError("WORKFLOW_STEP_CREATE_FAILED", 500, "Workflow step attempt could not be created.");
  return created;
}

export async function completeWorkflowStepAndAdvance(input: { runId: string; stepRunId: string; executionToken: string; nextStepId: string | null; output: JsonValue; safeMetadata: Record<string, string | number | boolean | null>; agentRunId?: string }, db: Database = getDatabase(), now = new Date()): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const [step] = await tx.update(workflowStepRuns).set({ status: "SUCCEEDED", safeOutput: input.output, safeMetadata: input.safeMetadata, agentRunId: input.agentRunId ?? null, completedAt: now, durationMs: 0 }).where(and(eq(workflowStepRuns.id, input.stepRunId), eq(workflowStepRuns.workflowRunId, input.runId), eq(workflowStepRuns.executionToken, input.executionToken), eq(workflowStepRuns.status, "RUNNING"))).returning();
      if (!step) return false;
      const [run] = await tx.update(workflowRuns).set({ currentStepId: input.nextStepId, updatedAt: now }).where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.executionToken, input.executionToken), eq(workflowRuns.status, "RUNNING"), gt(workflowRuns.leaseExpiresAt, now))).returning();
      if (!run) throw new Error("WORKFLOW_LEASE_LOST");
      return true;
    });
  } catch {
    return false;
  }
}

export async function failWorkflowStep(input: { stepRunId: string; runId: string; executionToken: string; errorCode: string; retryable: boolean }, db: Database = getDatabase(), now = new Date()): Promise<boolean> {
  const [step] = await db.update(workflowStepRuns).set({ status: input.retryable ? "INTERRUPTED" : "FAILED", errorCode: input.errorCode, safeMetadata: { errorCode: input.errorCode, retryable: input.retryable }, completedAt: now }).where(and(eq(workflowStepRuns.id, input.stepRunId), eq(workflowStepRuns.workflowRunId, input.runId), eq(workflowStepRuns.executionToken, input.executionToken), eq(workflowStepRuns.status, "RUNNING"))).returning();
  return Boolean(step);
}

export async function finishWorkflowRun(runId: string, executionToken: string, status: Extract<WorkflowRun["status"], "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT">, output: JsonValue | null, errorCode: string | null, db: Database = getDatabase(), now = new Date()): Promise<WorkflowRun | null> {
  const [finished] = await db.update(workflowRuns).set({ status, output, errorCode, leaseExpiresAt: null, completedAt: now, updatedAt: now }).where(and(eq(workflowRuns.id, runId), eq(workflowRuns.executionToken, executionToken), inArray(workflowRuns.status, ["RUNNING", "CANCEL_REQUESTED"]))).returning();
  return finished ?? null;
}

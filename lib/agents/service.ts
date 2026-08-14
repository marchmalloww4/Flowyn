import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getBrand } from "@/lib/brands/service";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { agentRunSteps, agentRuns, agents, getDatabase, type AgentRunStatus, type Database } from "@/lib/database";
import { createDefaultToolRegistry } from "@/lib/agents/registry";
import { getAgentExecutionPolicy } from "@/lib/agents/policy";
import { agentCreateSchema, agentPatchSchema, type AgentCreateInput, type AgentPatchInput } from "@/lib/agents/validation";
import { AppError } from "@/lib/security/errors";
import type { WorkspaceAutomationPrincipal } from "@/lib/security/principal";
import { acquireWorkspaceReservation, releaseWorkspaceReservation } from "@/lib/concurrency/service";
import { admitAgentRun } from "@/lib/usage/service";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";
import type { UsageOperationIdentity } from "@/lib/usage/types";
import { getCorrelationId } from "@/lib/observability/correlation";

export type AgentDefinition = typeof agents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;

export interface AgentRunHistory {
  run: Pick<AgentRun, "id" | "workspaceId" | "agentId" | "agentName" | "status" | "goal" | "stepCount" | "finalResponse" | "errorCode" | "startedAt" | "completedAt" | "createdAt" | "updatedAt">;
  steps: AgentRunStep[];
}

export interface AgentRunStepInput {
  workspaceId: string;
  runId: string;
  stepNumber: number;
  type: "MODEL_DECISION" | "TOOL_CALL" | "TOOL_RESULT" | "FINAL_RESPONSE" | "ERROR";
  toolName?: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  safeInputMetadata?: Record<string, string | number | boolean | null>;
  safeOutputMetadata?: Record<string, string | number | boolean | null>;
  errorCode?: string;
  startedAt?: Date;
  completedAt?: Date | null;
}

function validateConfiguredTools(toolNames: string[]): void {
  const registry = createDefaultToolRegistry();
  for (const name of toolNames) registry.get(name);
}

async function validateBrand(userId: string, workspaceId: string, brandId: string | null | undefined, db: Database): Promise<void> {
  if (!brandId) return;
  const brand = await getBrand(userId, brandId, db);
  if (brand.workspaceId !== workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
}

async function loadAgent(userId: string, agentId: string, db: Database): Promise<AgentDefinition> {
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, agentId), isNull(agents.deletedAt))).limit(1);
  if (!agent) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  await requireWorkspaceMember(userId, agent.workspaceId, db);
  return agent;
}

export async function getAgentForWorkspace(workspaceId: string, agentId: string, db: Database = getDatabase()): Promise<AgentDefinition> {
  const [agent] = await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt))).limit(1);
  if (!agent) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  return agent;
}

export async function createAgent(userId: string, input: AgentCreateInput, db: Database = getDatabase()): Promise<AgentDefinition> {
  const parsed = agentCreateSchema.parse(input);
  await requireWorkspaceAction(userId, parsed.workspaceId, "agent.write", db);
  await validateBrand(userId, parsed.workspaceId, parsed.brandId, db);
  validateConfiguredTools(parsed.allowedTools);
  getAgentExecutionPolicy(parsed.maxSteps);
  const [agent] = await db.insert(agents).values({
    workspaceId: parsed.workspaceId,
    brandId: parsed.brandId ?? null,
    name: parsed.name,
    description: parsed.description,
    systemInstructions: parsed.systemInstructions,
    allowedTools: parsed.allowedTools,
    enabled: parsed.enabled,
    maxSteps: parsed.maxSteps,
    createdBy: userId,
  }).returning();
  if (!agent) throw new AppError("AGENT_CREATE_FAILED", 500, "Agent could not be created.");
  await recordAuditEvent({ workspaceId: agent.workspaceId, actorUserId: userId, action: "agent.created", resourceType: "agent", resourceId: agent.id, metadata: { name: agent.name } }, db);
  return agent;
}

export async function listAgents(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<AgentDefinition[]> {
  await requireWorkspaceMember(userId, workspaceId, db);
  return db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt))).orderBy(desc(agents.createdAt));
}

export async function getAgent(userId: string, agentId: string, db: Database = getDatabase()): Promise<AgentDefinition> {
  return loadAgent(userId, agentId, db);
}

export async function updateAgent(userId: string, agentId: string, input: AgentPatchInput, db: Database = getDatabase()): Promise<AgentDefinition> {
  const existing = await loadAgent(userId, agentId, db);
  const parsed = agentPatchSchema.parse(input);
  await requireWorkspaceAction(userId, existing.workspaceId, "agent.write", db);
  await validateBrand(userId, existing.workspaceId, parsed.brandId, db);
  if (parsed.allowedTools) validateConfiguredTools(parsed.allowedTools);
  if (parsed.maxSteps !== undefined) getAgentExecutionPolicy(parsed.maxSteps);
  const [agent] = await db.update(agents).set({
    ...(parsed.brandId === undefined ? {} : { brandId: parsed.brandId }),
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    ...(parsed.systemInstructions === undefined ? {} : { systemInstructions: parsed.systemInstructions }),
    ...(parsed.allowedTools === undefined ? {} : { allowedTools: parsed.allowedTools }),
    ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
    ...(parsed.maxSteps === undefined ? {} : { maxSteps: parsed.maxSteps }),
    updatedAt: new Date(),
  }).where(and(eq(agents.id, existing.id), eq(agents.workspaceId, existing.workspaceId), isNull(agents.deletedAt))).returning();
  if (!agent) throw new AppError("AGENT_UPDATE_FAILED", 500, "Agent could not be updated.");
  await recordAuditEvent({ workspaceId: agent.workspaceId, actorUserId: userId, action: "agent.updated", resourceType: "agent", resourceId: agent.id, metadata: { fields: Object.keys(parsed) } }, db);
  return agent;
}

export async function deleteAgent(userId: string, agentId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await loadAgent(userId, agentId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "agent.delete", db);
  await db.transaction(async (tx) => {
    const [deleted] = await tx.update(agents).set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(agents.id, existing.id), eq(agents.workspaceId, existing.workspaceId), isNull(agents.deletedAt))).returning();
    if (!deleted) throw new AppError("AGENT_DELETE_FAILED", 500, "Agent could not be deleted.");
    await recordAuditEvent({ workspaceId: existing.workspaceId, actorUserId: userId, action: "agent.deleted", resourceType: "agent", resourceId: existing.id, metadata: { name: existing.name } }, tx);
  });
}

export type AgentStartResult = { agent: AgentDefinition; run: AgentRun; policy: ReturnType<typeof getAgentExecutionPolicy>; releaseReservation?: () => Promise<void>; idempotent: boolean };

async function reserveAgentCapacity(workspaceId: string, ownerId: string, usage: UsageOperationIdentity | undefined, policy: ReturnType<typeof getAgentExecutionPolicy>, db: Database): Promise<(() => Promise<void>) | undefined> {
  if (!usage) return undefined;
  const reservation = await acquireWorkspaceReservation({
    workspaceId,
    operationClass: "AGENT",
    sourceId: usage.operationKey,
    ownerId,
    limit: getWorkspaceUsagePolicy(workspaceId).limits.concurrentAgents,
    leaseMs: Math.min(3_600_000, Math.max(1_000, policy.totalTimeoutMs + 30_000)),
    db,
  }, db);
  if (!reservation.acquired || !reservation.reservation) throw new AppError("WORKSPACE_CONCURRENCY_LIMIT", 429, "Workspace agent concurrency limit reached.");
  const release = async () => {
    await releaseWorkspaceReservation({ reservationId: reservation.reservation?.id ?? "", workspaceId, ownerId }, db);
  };
  try {
    await admitAgentRun({ workspaceId, ...usage, db });
  } catch (error) {
    await release();
    throw error;
  }
  return release;
}

export async function startAgentRun(userId: string, agentId: string, goal: string, db: Database = getDatabase(), usage?: UsageOperationIdentity, idempotencyKey?: string): Promise<AgentStartResult> {
  const agent = await loadAgent(userId, agentId, db);
  await requireWorkspaceAction(userId, agent.workspaceId, "agent.run", db);
  if (idempotencyKey) {
    const [existing] = await db.select().from(agentRuns).where(and(eq(agentRuns.workspaceId, agent.workspaceId), eq(agentRuns.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      if (existing.agentId !== agent.id || existing.goal !== goal) throw new AppError("AGENT_IDEMPOTENCY_CONFLICT", 409, "The Idempotency-Key is already associated with a different agent run.");
      return { agent, run: existing, policy: getAgentExecutionPolicy(agent.maxSteps), idempotent: true };
    }
  }
  if (!agent.enabled) throw new AppError("AGENT_DISABLED", 409, "The agent is disabled.");
  const policy = getAgentExecutionPolicy(agent.maxSteps);
  const releaseReservation = await reserveAgentCapacity(agent.workspaceId, userId, usage, policy, db);
  try {
    const [run] = await db.insert(agentRuns).values({
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      startedBy: userId,
      status: "RUNNING",
      goal,
      idempotencyKey: idempotencyKey ?? null,
      stepCount: 0,
      correlationId: usage?.correlationId ?? getCorrelationId(),
      startedAt: new Date(),
    }).returning();
    if (!run) throw new AppError("AGENT_RUN_CREATE_FAILED", 500, "The agent run could not be created.");
    await recordAuditEvent({ workspaceId: run.workspaceId, actorUserId: userId, action: "agent.run_started", resourceType: "agent_run", resourceId: run.id, metadata: { agentId: agent.id } }, db);
    return { agent, run, policy, releaseReservation, idempotent: false };
  } catch (error) {
    await releaseReservation?.();
    throw error;
  }
}

export async function startAgentRunForPrincipal(principal: WorkspaceAutomationPrincipal, agentId: string, goal: string, db: Database = getDatabase(), usage?: UsageOperationIdentity): Promise<AgentStartResult> {
  const agent = await getAgentForWorkspace(principal.workspaceId, agentId, db);
  if (!agent.enabled) throw new AppError("AGENT_DISABLED", 409, "The agent is disabled.");
  const policy = getAgentExecutionPolicy(agent.maxSteps);
  const releaseReservation = await reserveAgentCapacity(agent.workspaceId, `${principal.workspaceId}:automation`, usage, policy, db);
  try {
    const [run] = await db.insert(agentRuns).values({
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      agentName: agent.name,
      startedBy: null,
      status: "RUNNING",
      goal,
      stepCount: 0,
      correlationId: usage?.correlationId ?? getCorrelationId(),
      startedAt: new Date(),
    }).returning();
    if (!run) throw new AppError("AGENT_RUN_CREATE_FAILED", 500, "The agent run could not be created.");
    await recordAuditEvent({ workspaceId: run.workspaceId, actorUserId: null, action: "agent.run_started", resourceType: "agent_run", resourceId: run.id, metadata: { agentId: agent.id, principalKind: principal.kind, scheduleId: principal.scheduleId } }, db);
    return { agent, run, policy, releaseReservation, idempotent: false };
  } catch (error) {
    await releaseReservation?.();
    throw error;
  }
}

export async function recordAgentRunStep(input: AgentRunStepInput, db: Database = getDatabase()): Promise<void> {
  await db.insert(agentRunSteps).values({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stepNumber: input.stepNumber,
    type: input.type,
    toolName: input.toolName ?? null,
    status: input.status,
    safeInputMetadata: input.safeInputMetadata ?? {},
    safeOutputMetadata: input.safeOutputMetadata ?? {},
    errorCode: input.errorCode ?? null,
    startedAt: input.startedAt ?? new Date(),
    completedAt: input.completedAt ?? new Date(),
  });
}

export async function completeAgentRun(runId: string, result: { status: "COMPLETED"; stepCount: number; finalResponse: string }, db: Database = getDatabase()): Promise<AgentRun> {
  return updateAgentRun(runId, result, db, "agent.run_completed");
}

export async function failAgentRun(runId: string, result: { status: Exclude<AgentRunStatus, "PENDING" | "RUNNING" | "COMPLETED">; stepCount: number; errorCode: string; finalResponse?: string }, db: Database = getDatabase()): Promise<AgentRun> {
  return updateAgentRun(runId, result, db, "agent.run_failed");
}

export async function getAgentRun(userId: string, runId: string, db: Database = getDatabase()): Promise<AgentRunHistory> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  await requireWorkspaceMember(userId, run.workspaceId, db);
  const steps = await db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, run.id)).orderBy(asc(agentRunSteps.stepNumber), asc(agentRunSteps.id));
  return {
    run: {
      id: run.id,
      workspaceId: run.workspaceId,
      agentId: run.agentId,
      agentName: run.agentName,
      status: run.status,
      goal: run.goal,
      stepCount: run.stepCount,
      finalResponse: run.finalResponse,
      errorCode: run.errorCode,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
    steps,
  };
}

async function updateAgentRun(runId: string, result: { status: AgentRunStatus; stepCount: number; errorCode?: string; finalResponse?: string }, db: Database, auditAction: "agent.run_completed" | "agent.run_failed"): Promise<AgentRun> {
  const [run] = await db.update(agentRuns).set({
    status: result.status,
    stepCount: result.stepCount,
    ...(result.finalResponse === undefined ? {} : { finalResponse: result.finalResponse }),
    ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(agentRuns.id, runId)).returning();
  if (!run) throw new AppError("AGENT_RUN_UPDATE_FAILED", 500, "The agent run could not be updated.");
  await recordAuditEvent({ workspaceId: run.workspaceId, actorUserId: run.startedBy, action: auditAction, resourceType: "agent_run", resourceId: run.id, metadata: { status: run.status, stepCount: run.stepCount, errorCode: run.errorCode } }, db);
  return run;
}

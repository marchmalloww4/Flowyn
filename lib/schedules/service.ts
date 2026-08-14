import { and, desc, eq, isNull } from "drizzle-orm";
import { getWorkflow } from "@/lib/workflows/service";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, type Database, workflowScheduleOccurrences, workflowSchedules } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { calculateNextRunAt, type ScheduleCalculationInput } from "@/lib/schedules/calculator";
import { validateScheduleInput } from "@/lib/schedules/validation";

export type WorkflowSchedule = typeof workflowSchedules.$inferSelect;
export type WorkflowScheduleOccurrence = typeof workflowScheduleOccurrences.$inferSelect;

export interface CreateWorkflowScheduleInput {
  workspaceId: string;
  workflowId: string;
  schedule: unknown;
}

export interface UpdateWorkflowScheduleInput {
  type?: unknown;
  cronExpression?: unknown;
  intervalSeconds?: unknown;
  runAt?: unknown;
  timezone?: unknown;
  misfirePolicy?: unknown;
  input?: unknown;
}

function scheduleCalculationInput(schedule: {
  type: WorkflowSchedule["type"];
  cronExpression: string | null;
  intervalSeconds: number | null;
  runAt: Date | null;
  timezone: string;
  misfirePolicy: WorkflowSchedule["misfirePolicy"];
  nextRunAt?: Date | null;
}): ScheduleCalculationInput {
  return {
    type: schedule.type,
    cronExpression: schedule.cronExpression,
    intervalSeconds: schedule.intervalSeconds,
    runAt: schedule.runAt,
    timezone: schedule.timezone,
    misfirePolicy: schedule.misfirePolicy,
    nextRunAt: schedule.nextRunAt ?? null,
  };
}

function initialNextRunAt(schedule: ScheduleCalculationInput, now = new Date()): Date | null {
  if (schedule.type === "ONE_TIME") return schedule.runAt ? new Date(schedule.runAt) : null;
  return calculateNextRunAt(schedule, now);
}

function scheduleInputFromRecord(schedule: WorkflowSchedule): Record<string, unknown> {
  return {
    type: schedule.type,
    cronExpression: schedule.cronExpression,
    intervalSeconds: schedule.intervalSeconds,
    runAt: schedule.runAt,
    timezone: schedule.timezone,
    misfirePolicy: schedule.misfirePolicy,
    input: schedule.input,
  };
}

async function loadSchedule(scheduleId: string, db: Database): Promise<WorkflowSchedule> {
  const [schedule] = await db.select().from(workflowSchedules).where(and(eq(workflowSchedules.id, scheduleId), isNull(workflowSchedules.deletedAt))).limit(1);
  if (!schedule) throw new AppError("WORKFLOW_SCHEDULE_NOT_FOUND", 404, "Workflow schedule not found.");
  return schedule;
}

export async function listWorkflowSchedules(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<WorkflowSchedule[]> {
  await requireWorkspaceAction(userId, workspaceId, "workflow_schedule.read", db);
  return db.select().from(workflowSchedules)
    .where(and(eq(workflowSchedules.workspaceId, workspaceId), isNull(workflowSchedules.deletedAt)))
    .orderBy(desc(workflowSchedules.updatedAt));
}

export async function getWorkflowSchedule(userId: string, scheduleId: string, db: Database = getDatabase()): Promise<WorkflowSchedule> {
  const schedule = await loadSchedule(scheduleId, db);
  await requireWorkspaceAction(userId, schedule.workspaceId, "workflow_schedule.read", db);
  return schedule;
}

export async function listWorkflowScheduleOccurrences(userId: string, scheduleId: string, db: Database = getDatabase()): Promise<WorkflowScheduleOccurrence[]> {
  const schedule = await getWorkflowSchedule(userId, scheduleId, db);
  return db.select().from(workflowScheduleOccurrences)
    .where(and(eq(workflowScheduleOccurrences.scheduleId, schedule.id), eq(workflowScheduleOccurrences.workspaceId, schedule.workspaceId)))
    .orderBy(desc(workflowScheduleOccurrences.scheduledFor), desc(workflowScheduleOccurrences.createdAt))
    .limit(100);
}

export async function createWorkflowSchedule(userId: string, input: CreateWorkflowScheduleInput, db: Database = getDatabase()): Promise<WorkflowSchedule> {
  await requireWorkspaceAction(userId, input.workspaceId, "workflow_schedule.create", db);
  const workflow = await getWorkflow(userId, input.workflowId, db);
  if (workflow.workspaceId !== input.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  const parsed = validateScheduleInput(input.schedule);
  const now = new Date();
  const nextRunAt = initialNextRunAt(scheduleCalculationInput({ ...parsed, nextRunAt: null }), now);
  const [created] = await db.insert(workflowSchedules).values({
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    type: parsed.type,
    enabled: true,
    cronExpression: parsed.cronExpression,
    intervalSeconds: parsed.intervalSeconds,
    runAt: parsed.runAt,
    timezone: parsed.timezone,
    misfirePolicy: parsed.misfirePolicy,
    input: parsed.input,
    nextRunAt,
    createdBy: userId,
  }).returning();
  if (!created) throw new AppError("WORKFLOW_SCHEDULE_CREATE_FAILED", 500, "Workflow schedule could not be created.");
  await recordAuditEvent({ workspaceId: created.workspaceId, actorUserId: userId, action: "workflow_schedule.created", resourceType: "workflow_schedule", resourceId: created.id, metadata: { workflowId: created.workflowId, type: created.type, timezone: created.timezone } }, db);
  return created;
}

export async function updateWorkflowSchedule(userId: string, scheduleId: string, input: UpdateWorkflowScheduleInput, db: Database = getDatabase()): Promise<WorkflowSchedule> {
  const existing = await loadSchedule(scheduleId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow_schedule.update", db);
  if (existing.lastProcessedAt && (input.type !== undefined || input.cronExpression !== undefined || input.intervalSeconds !== undefined || input.runAt !== undefined || input.timezone !== undefined)) {
    throw new AppError("WORKFLOW_SCHEDULE_CONSUMED", 409, "A processed schedule cannot change its timing.");
  }
  const parsed = validateScheduleInput({ ...scheduleInputFromRecord(existing), ...input });
  const timingChanged = input.type !== undefined || input.cronExpression !== undefined || input.intervalSeconds !== undefined || input.runAt !== undefined || input.timezone !== undefined || input.misfirePolicy !== undefined;
  const nextRunAt = timingChanged
    ? initialNextRunAt(scheduleCalculationInput({ ...parsed, nextRunAt: existing.nextRunAt }), new Date())
    : existing.nextRunAt;
  const [updated] = await db.update(workflowSchedules).set({
    type: parsed.type,
    cronExpression: parsed.cronExpression,
    intervalSeconds: parsed.intervalSeconds,
    runAt: parsed.runAt,
    timezone: parsed.timezone,
    misfirePolicy: parsed.misfirePolicy,
    input: parsed.input,
    ...(timingChanged ? { nextRunAt } : {}),
    updatedAt: new Date(),
  }).where(and(eq(workflowSchedules.id, existing.id), eq(workflowSchedules.workspaceId, existing.workspaceId), isNull(workflowSchedules.deletedAt))).returning();
  if (!updated) throw new AppError("WORKFLOW_SCHEDULE_UPDATE_FAILED", 500, "Workflow schedule could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "workflow_schedule.updated", resourceType: "workflow_schedule", resourceId: updated.id, metadata: { fields: Object.keys(input) } }, db);
  return updated;
}

export async function setWorkflowScheduleEnabled(userId: string, scheduleId: string, enabled: boolean, db: Database = getDatabase()): Promise<WorkflowSchedule> {
  const existing = await loadSchedule(scheduleId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, enabled ? "workflow_schedule.enable" : "workflow_schedule.disable", db);
  if (enabled && existing.type === "ONE_TIME" && existing.lastProcessedAt) {
    throw new AppError("WORKFLOW_SCHEDULE_CONSUMED", 409, "A processed one-time schedule cannot be enabled.");
  }
  if (enabled && !existing.nextRunAt) {
    throw new AppError("WORKFLOW_SCHEDULE_NOT_ARMED", 409, "The schedule has no next run time.");
  }
  const [updated] = await db.update(workflowSchedules).set({ enabled, updatedAt: new Date() }).where(and(eq(workflowSchedules.id, existing.id), isNull(workflowSchedules.deletedAt))).returning();
  if (!updated) throw new AppError("WORKFLOW_SCHEDULE_UPDATE_FAILED", 500, "Workflow schedule could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: enabled ? "workflow_schedule.enabled" : "workflow_schedule.disabled", resourceType: "workflow_schedule", resourceId: updated.id, metadata: { enabled } }, db);
  return updated;
}

export async function deleteWorkflowSchedule(userId: string, scheduleId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await loadSchedule(scheduleId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow_schedule.delete", db);
  const [deleted] = await db.update(workflowSchedules).set({ enabled: false, nextRunAt: null, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(workflowSchedules.id, existing.id), isNull(workflowSchedules.deletedAt))).returning();
  if (!deleted) throw new AppError("WORKFLOW_SCHEDULE_DELETE_FAILED", 500, "Workflow schedule could not be deleted.");
  await recordAuditEvent({ workspaceId: deleted.workspaceId, actorUserId: userId, action: "workflow_schedule.deleted", resourceType: "workflow_schedule", resourceId: deleted.id, metadata: { workflowId: deleted.workflowId } }, db);
}

export function toScheduleCalculationInput(schedule: WorkflowSchedule): ScheduleCalculationInput {
  return scheduleCalculationInput(schedule);
}

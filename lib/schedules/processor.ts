import { and, eq, isNull, lte } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, type Database, workflowScheduleOccurrences, workflowSchedules, workflows } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { getEnv } from "@/lib/env";
import { calculateDueSchedule } from "@/lib/schedules/calculator";
import { createScheduledWorkflowRun } from "@/lib/workflows/service";
import { workspaceAutomationPrincipal } from "@/lib/security/principal";
import { toScheduleCalculationInput, type WorkflowSchedule } from "@/lib/schedules/service";

export interface ScheduleProcessingMetrics {
  claimed: number;
  triggered: number;
  skipped: number;
  failed: number;
}
export interface ScheduleProcessingOptions {
  now?: Date;
  batchSize?: number;
  graceSeconds?: number;
}

function boundedReason(error: unknown): string {
  if (error instanceof AppError && /^[A-Z0-9_]+$/.test(error.code)) return "SCHEDULE_TRIGGER_FAILED";
  return "SCHEDULE_TRIGGER_FAILED";
}

async function recordOccurrenceOutcome(
  tx: Database,
  schedule: WorkflowSchedule,
  scheduledFor: Date,
  status: "SKIPPED" | "FAILED",
  reasonCode: string,
  nextRunAt: Date | null,
  terminal: boolean,
  now: Date,
): Promise<void> {
  const [occurrence] = await tx.insert(workflowScheduleOccurrences).values({
    workspaceId: schedule.workspaceId,
    scheduleId: schedule.id,
    scheduledFor,
    status,
    reasonCode,
    processedAt: now,
  }).onConflictDoNothing({
    target: [workflowScheduleOccurrences.scheduleId, workflowScheduleOccurrences.scheduledFor],
  }).returning();
  if (!occurrence) return;
  await tx.update(workflowSchedules).set({
    enabled: terminal ? false : schedule.enabled,
    nextRunAt,
    lastProcessedAt: now,
    updatedAt: now,
  }).where(eq(workflowSchedules.id, schedule.id));
  await recordAuditEvent({
    workspaceId: schedule.workspaceId,
    actorUserId: null,
    action: "workflow_schedule.skipped",
    resourceType: "workflow_schedule",
    resourceId: schedule.id,
    metadata: {
      workflowId: schedule.workflowId,
      occurrenceId: occurrence.id,
      scheduledFor: scheduledFor.toISOString(),
      status,
      reasonCode,
    },
  }, tx);
}

async function processOneSchedule(scheduleId: string, options: Required<ScheduleProcessingOptions>, db: Database): Promise<"TRIGGERED" | "SKIPPED" | "FAILED" | null> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx.select().from(workflowSchedules)
      .where(and(eq(workflowSchedules.id, scheduleId), eq(workflowSchedules.enabled, true), isNull(workflowSchedules.deletedAt), lte(workflowSchedules.nextRunAt, options.now)))
      .for("update", { skipLocked: true })
      .limit(1);
    if (!schedule) return null;

    const decision = calculateDueSchedule(toScheduleCalculationInput(schedule), options.now, options.graceSeconds);
    if (decision.action === "WAIT" || !decision.scheduledFor) return null;

    const [workflow] = await tx.select().from(workflows)
      .where(and(eq(workflows.id, schedule.workflowId), eq(workflows.workspaceId, schedule.workspaceId)))
      .limit(1);
    if (!workflow || workflow.deletedAt) {
      await recordOccurrenceOutcome(tx, schedule, decision.scheduledFor, "SKIPPED", "SCHEDULE_WORKFLOW_DELETED", decision.nextRunAt, true, options.now);
      return "SKIPPED";
    }
    if (!workflow.enabled) {
      await recordOccurrenceOutcome(tx, schedule, decision.scheduledFor, "SKIPPED", "SCHEDULE_WORKFLOW_DISABLED", decision.nextRunAt, decision.terminal, options.now);
      return "SKIPPED";
    }

    const [occurrence] = await tx.insert(workflowScheduleOccurrences).values({
      workspaceId: schedule.workspaceId,
      scheduleId: schedule.id,
      scheduledFor: decision.scheduledFor,
      status: decision.action === "TRIGGER" ? "TRIGGERED" : "SKIPPED",
      reasonCode: decision.reasonCode ?? null,
      processedAt: decision.action === "TRIGGER" ? null : options.now,
    }).onConflictDoNothing({
      target: [workflowScheduleOccurrences.scheduleId, workflowScheduleOccurrences.scheduledFor],
    }).returning();
    if (!occurrence) return null;

    if (decision.action === "SKIP") {
      await tx.update(workflowSchedules).set({
        enabled: decision.terminal ? false : schedule.enabled,
        nextRunAt: decision.nextRunAt,
        lastProcessedAt: options.now,
        updatedAt: options.now,
      }).where(eq(workflowSchedules.id, schedule.id));
      await recordAuditEvent({
        workspaceId: schedule.workspaceId,
        actorUserId: null,
        action: "workflow_schedule.skipped",
        resourceType: "workflow_schedule",
        resourceId: schedule.id,
        metadata: {
          workflowId: schedule.workflowId,
          occurrenceId: occurrence.id,
          scheduledFor: decision.scheduledFor.toISOString(),
          status: "SKIPPED",
          reasonCode: decision.reasonCode ?? "SCHEDULE_MISFIRE_GRACE_EXCEEDED",
        },
      }, tx);
      return "SKIPPED";
    }

    try {
      const run = await createScheduledWorkflowRun({
        principal: workspaceAutomationPrincipal(schedule.workspaceId, schedule.id),
        scheduleId: schedule.id,
        occurrenceId: occurrence.id,
        workspaceId: schedule.workspaceId,
        workflowId: schedule.workflowId,
        input: schedule.input,
        idempotencyKey: "workflow-schedule:" + schedule.id + ":" + decision.scheduledFor.toISOString(),
      }, tx);
      await tx.update(workflowScheduleOccurrences).set({ workflowRunId: run.id, processedAt: options.now }).where(eq(workflowScheduleOccurrences.id, occurrence.id));
      await tx.update(workflowSchedules).set({
        enabled: decision.terminal ? false : schedule.enabled,
        nextRunAt: decision.nextRunAt,
        lastTriggeredAt: options.now,
        lastProcessedAt: options.now,
        updatedAt: options.now,
      }).where(eq(workflowSchedules.id, schedule.id));
      await recordAuditEvent({
        workspaceId: schedule.workspaceId,
        actorUserId: null,
        action: "workflow_schedule.triggered",
        resourceType: "workflow_schedule",
        resourceId: schedule.id,
        metadata: {
          workflowId: schedule.workflowId,
          occurrenceId: occurrence.id,
          workflowRunId: run.id,
          scheduledFor: decision.scheduledFor.toISOString(),
          status: "TRIGGERED",
        },
      }, tx);
      return "TRIGGERED";
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      const reasonCode = boundedReason(error);
      await tx.update(workflowScheduleOccurrences).set({ status: "FAILED", reasonCode, processedAt: options.now }).where(eq(workflowScheduleOccurrences.id, occurrence.id));
      await tx.update(workflowSchedules).set({
        enabled: decision.terminal ? false : schedule.enabled,
        nextRunAt: decision.nextRunAt,
        lastProcessedAt: options.now,
        updatedAt: options.now,
      }).where(eq(workflowSchedules.id, schedule.id));
      return "FAILED";
    }
  });
}

export async function processDueSchedules(
  options: ScheduleProcessingOptions = {},
  db: Database = getDatabase(),
): Promise<ScheduleProcessingMetrics> {
  const env = getEnv();
  const normalized: Required<ScheduleProcessingOptions> = {
    now: options.now ?? new Date(),
    batchSize: options.batchSize ?? env.SCHEDULER_BATCH_SIZE,
    graceSeconds: options.graceSeconds ?? env.SCHEDULE_MISFIRE_GRACE_SECONDS,
  };
  if (!Number.isInteger(normalized.batchSize) || normalized.batchSize < 1 || normalized.batchSize > 100) {
    throw new AppError("SCHEDULER_BATCH_INVALID", 500, "The scheduler batch size is invalid.");
  }
  const due = await db.select({ id: workflowSchedules.id }).from(workflowSchedules)
    .where(and(eq(workflowSchedules.enabled, true), isNull(workflowSchedules.deletedAt), lte(workflowSchedules.nextRunAt, normalized.now)))
    .limit(normalized.batchSize);
  const metrics: ScheduleProcessingMetrics = { claimed: 0, triggered: 0, skipped: 0, failed: 0 };
  for (const schedule of due) {
    const outcome = await processOneSchedule(schedule.id, normalized, db);
    if (!outcome) continue;
    metrics.claimed += 1;
    metrics[outcome.toLowerCase() as "triggered" | "skipped" | "failed"] += 1;
  }
  return metrics;
}

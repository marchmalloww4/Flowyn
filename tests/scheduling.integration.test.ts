import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { closeQueueConnection, createQueueWorkerConnection } from "@/lib/queue/connection";
import { closeWorkflowQueue } from "@/lib/workflows/queue";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { createWorkflow } from "@/lib/workflows/service";
import { closeDatabase, getDatabase, user, workflowRuns, workflowScheduleOccurrences, workspaces, workspaceMembers } from "@/lib/database";
import { createWorkflowSchedule } from "@/lib/schedules/service";
import { processDueSchedules } from "@/lib/schedules/processor";
import { WORKFLOW_QUEUE_NAME } from "@/lib/workflows/queue";

const integrationEnabled = process.env.RUN_SCHEDULER_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;
const definition = { schemaVersion: 1 as const, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "scheduled-output" } } }] };

async function waitForRun(runId: string) {
  const db = getDatabase();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
    if (run && ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for scheduled workflow run.");
}

describeIntegration("workflow scheduling PostgreSQL/Redis/BullMQ integration", () => {
  const db = getDatabase();
  const userId = `schedule-integration-${randomUUID()}`;
  const workspaceId = randomUUID();
  let worker: Worker | undefined;
  let workerConnection: ReturnType<typeof createQueueWorkerConnection> | undefined;

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Schedule Integration", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "Schedule Integration", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
    workerConnection = createQueueWorkerConnection();
    worker = new Worker(WORKFLOW_QUEUE_NAME, async (job) => executeWorkflowRun({ runId: job.data.runId, workerId: "schedule-integration-worker" }), { connection: workerConnection, concurrency: 1 });
  });

  afterAll(async () => {
    await worker?.close();
    await workerConnection?.quit();
    await closeWorkflowQueue();
    await closeQueueConnection();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
    await closeDatabase();
  });

  it("creates one durable one-time occurrence and executes it once", async () => {
    const workflow = await createWorkflow(userId, { workspaceId, name: "Scheduled workflow", description: "integration", definition, enabled: true }, db);
    const scheduledFor = new Date(Date.now() - 5_000);
    const schedule = await createWorkflowSchedule(userId, {
      workspaceId,
      workflowId: workflow.id,
      schedule: { type: "ONE_TIME", runAt: scheduledFor.toISOString(), timezone: "UTC", misfirePolicy: "FIRE_ONCE", input: { source: "integration" } },
    }, db);

    const metrics = await processDueSchedules({ now: new Date(), graceSeconds: 60, batchSize: 5 }, db);
    expect(metrics.triggered + metrics.skipped).toBeGreaterThanOrEqual(1);
    await dispatchPendingWorkflowRuns({ db, dispatcherId: "schedule-integration-dispatcher" });

    const [occurrence] = await db.select().from(workflowScheduleOccurrences).where(and(eq(workflowScheduleOccurrences.scheduleId, schedule.id), eq(workflowScheduleOccurrences.scheduledFor, scheduledFor))).limit(1);
    expect(occurrence?.status).toBe("TRIGGERED");
    expect(occurrence?.workflowRunId).toBeTruthy();
    const run = await waitForRun(occurrence!.workflowRunId!);
    expect(run.status).toBe("COMPLETED");
    expect(run.output).toBe("scheduled-output");
    expect(run.startedBy).toBeNull();

    const secondPass = await processDueSchedules({ now: new Date(Date.now() + 60_000), graceSeconds: 60, batchSize: 5 }, db);
    expect(secondPass.triggered).toBe(0);
    expect(await db.select().from(workflowScheduleOccurrences).where(eq(workflowScheduleOccurrences.scheduleId, schedule.id))).toHaveLength(1);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { closeQueueConnection, createQueueWorkerConnection } from "@/lib/queue/connection";
import { bullmqWorkflowJobId, closeWorkflowQueue, enqueueWorkflowRun, getWorkflowQueue, WORKFLOW_QUEUE_NAME } from "@/lib/workflows/queue";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { createWorkflow, createWorkflowRun, getWorkflowRunRecord, updateWorkflow } from "@/lib/workflows/service";
import { closeDatabase, getDatabase, user, workspaceMembers, workspaces } from "@/lib/database";

const integrationEnabled = process.env.RUN_WORKFLOW_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;
const definitionV1 = { schemaVersion: 1 as const, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "version-one" } } }] };
const definitionV2 = { schemaVersion: 1 as const, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "version-two" } } }] };

async function waitForRun(runId: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await getWorkflowRunRecord(runId);
    if (run && ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for workflow run ${runId}.`);
}

describeIntegration("workflow PostgreSQL/Redis/BullMQ integration", () => {
  const db = getDatabase();
  const userId = `workflow-integration-${randomUUID()}`;
  const workspaceId = randomUUID();
  let worker: Worker | undefined;
  let workerConnection: ReturnType<typeof createQueueWorkerConnection> | undefined;

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Workflow Integration", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "Workflow Integration", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
    workerConnection = createQueueWorkerConnection();
    worker = new Worker(WORKFLOW_QUEUE_NAME, async (job) => executeWorkflowRun({ runId: job.data.runId, workerId: "integration-worker" }), { connection: workerConnection, concurrency: 1 });
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

  it("executes immutable snapshots, idempotent runs, and duplicate deterministic jobs", async () => {
    const workflow = await createWorkflow(userId, { workspaceId, name: "Versioned workflow", description: "integration", definition: definitionV1, enabled: true }, db);
    const first = await createWorkflowRun(userId, workflow.id, { source: "first" }, "integration-key", db);
    const repeated = await createWorkflowRun(userId, workflow.id, { source: "ignored-on-replay" }, "integration-key", db);
    expect(repeated.id).toBe(first.id);
    await updateWorkflow(userId, workflow.id, { definition: definitionV2 }, db);
    const second = await createWorkflowRun(userId, workflow.id, { source: "second" }, undefined, db);
    expect(first.workflowVersion).toBe(1);
    expect(second.workflowVersion).toBe(2);
    expect(first.definitionSnapshot).toEqual(definitionV1);
    expect(second.definitionSnapshot).toEqual(definitionV2);
    await enqueueWorkflowRun(first.id);
    await enqueueWorkflowRun(first.id);
    await dispatchPendingWorkflowRuns({ db, dispatcherId: "integration-dispatcher" });
    await dispatchPendingWorkflowRuns({ db, dispatcherId: "integration-dispatcher" });
    const [completedFirst, completedSecond] = await Promise.all([waitForRun(first.id), (async () => { await dispatchPendingWorkflowRuns({ db, dispatcherId: "integration-dispatcher" }); return waitForRun(second.id); })()]);
    expect(completedFirst.status).toBe("COMPLETED");
    expect(completedFirst.output).toBe("version-one");
    expect(completedSecond.status).toBe("COMPLETED");
    expect(completedSecond.output).toBe("version-two");
    const job = await getWorkflowQueue().getJob(bullmqWorkflowJobId(first.id));
    expect(job?.id).toBe(bullmqWorkflowJobId(first.id));
  });
});

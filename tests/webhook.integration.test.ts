import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { POST } from "@/app/api/hooks/[publicId]/route";
import { closeQueueConnection, createQueueWorkerConnection } from "@/lib/queue/connection";
import { closeWorkflowQueue, WORKFLOW_QUEUE_NAME } from "@/lib/workflows/queue";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { createWorkflow, getWorkflowRunRecord } from "@/lib/workflows/service";
import { closeDatabase, getDatabase, user, workflowRunDispatches, workflowRuns, workflowWebhookEvents, workspaces, workspaceMembers } from "@/lib/database";
import { createWorkflowWebhook } from "@/lib/webhooks/service";
import { buildSignedMessage, createWebhookSignature } from "@/lib/webhooks/protocol";

const integrationEnabled = process.env.RUN_WEBHOOK_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;
const definition = {
  schemaVersion: 1 as const,
  entryStepId: "start",
  steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "webhook-output" } } }],
};

async function waitForRun(runId: string) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await getWorkflowRunRecord(runId);
    if (run && ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for webhook workflow run ${runId}.`);
}

async function postDelivery(publicId: string, secret: string, eventId: string, body: string, timestamp: string) {
  const rawBody = Buffer.from(body, "utf8");
  const signature = createWebhookSignature(secret, buildSignedMessage(timestamp, rawBody));
  return POST(new Request(`http://localhost/api/hooks/${publicId}`, {
    method: "POST",
    body: rawBody,
    headers: {
      "Content-Type": "application/json",
      "X-Flowyn-Timestamp": timestamp,
      "X-Flowyn-Signature": signature,
      "X-Flowyn-Event-Id": eventId,
    },
  }), { params: Promise.resolve({ publicId }) });
}

describeIntegration("workflow webhook PostgreSQL/Redis/BullMQ integration", () => {
  const db = getDatabase();
  const userId = `webhook-integration-${randomUUID()}`;
  const workspaceId = randomUUID();
  let worker: Worker | undefined;
  let workerConnection: ReturnType<typeof createQueueWorkerConnection> | undefined;

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Webhook Integration", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "Webhook Integration", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
    workerConnection = createQueueWorkerConnection();
    worker = new Worker(WORKFLOW_QUEUE_NAME, async (job) => executeWorkflowRun({ runId: job.data.runId, workerId: "webhook-integration-worker" }), { connection: workerConnection, concurrency: 1 });
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

  it("accepts a signed delivery once, deduplicates replay, and executes the existing workflow worker path", async () => {
    const workflow = await createWorkflow(userId, { workspaceId, name: "Webhook workflow", description: "integration", definition, enabled: true }, db);
    const webhook = await createWorkflowWebhook(userId, { workspaceId, workflowId: workflow.id, name: "Integration webhook" }, db);
    const body = JSON.stringify({ event: "publish", value: 42 });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const firstResponse = await postDelivery(webhook.trigger.publicId, webhook.secret, "delivery-1", body, timestamp);
    expect(firstResponse.status).toBe(202);
    expect(await firstResponse.json()).toEqual({ accepted: true, duplicate: false });

    const duplicateResponse = await postDelivery(webhook.trigger.publicId, webhook.secret, "delivery-1", body, timestamp);
    expect(duplicateResponse.status).toBe(202);
    expect(await duplicateResponse.json()).toEqual({ accepted: true, duplicate: true });

    const events = await db.select().from(workflowWebhookEvents)
      .where(and(eq(workflowWebhookEvents.triggerId, webhook.trigger.id), eq(workflowWebhookEvents.workspaceId, workspaceId)));
    const [triggeredEvent] = events;
    expect(events).toHaveLength(1);
    expect(triggeredEvent?.workflowRunId).toBeTruthy();
    expect(triggeredEvent?.status).toBe("TRIGGERED");
    expect(triggeredEvent?.duplicateCount).toBe(1);

    const runId = triggeredEvent!.workflowRunId!;
    const [dispatch] = await db.select().from(workflowRunDispatches).where(eq(workflowRunDispatches.runId, runId)).limit(1);
    expect(dispatch).toBeTruthy();
    await dispatchPendingWorkflowRuns({ db, dispatcherId: "webhook-integration-dispatcher" });
    const run = await waitForRun(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.output).toBe("webhook-output");
    expect(run.startedBy).toBeNull();

    const [storedRun] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
    expect(storedRun?.input).toEqual({ event: "publish", value: 42 });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { POST as webhookPost } from "@/app/api/hooks/[publicId]/route";
import { closeQueueConnection, createQueueWorkerConnection } from "@/lib/queue/connection";
import { closeWorkflowQueue, WORKFLOW_QUEUE_NAME } from "@/lib/workflows/queue";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { decideWorkflowApproval, expireWorkflowApprovals } from "@/lib/workflows/approval-service";
import { executeWorkflowRun } from "@/lib/workflows/executor";
import { cancelWorkflowRun, createWorkflow, createWorkflowRun, getWorkflowRunRecord } from "@/lib/workflows/service";
import { closeDatabase, getDatabase, user, workflowApprovalRequests, workflowRunDispatches, workflowRuns, workflowScheduleOccurrences, workflowStepRuns, workflowWebhookEvents, workspaces, workspaceMembers } from "@/lib/database";
import { createWorkflowSchedule } from "@/lib/schedules/service";
import { processDueSchedules } from "@/lib/schedules/processor";
import { createWorkflowWebhook } from "@/lib/webhooks/service";
import { buildSignedMessage, createWebhookSignature } from "@/lib/webhooks/protocol";
import type { WorkflowDefinition } from "@/lib/workflows/types";

const integrationEnabled = process.env.RUN_APPROVAL_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;
const definition = {
  schemaVersion: 1 as const,
  entryStepId: "start",
  steps: [
    { id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value: "before-approval" } }, nextStepId: "approval" },
    { id: "approval", type: "APPROVAL" as const, name: "Human approval", config: { requiredRole: "ADMIN" as const }, nextStepId: "finish" },
    { id: "finish", type: "SET_VALUE" as const, name: "Finish", config: { value: { kind: "literal" as const, value: "after-approval" } } },
  ],
};

function definitionWithApproval(config: { requiredRole: "OWNER" | "ADMIN"; expiresAfterSeconds?: number }): WorkflowDefinition {
  return {
    schemaVersion: 1 as const,
    entryStepId: "start",
    steps: [
      { id: "start", type: "SET_VALUE", name: "Start", config: { value: { kind: "literal", value: "before-approval" } }, nextStepId: "approval" },
      { id: "approval", type: "APPROVAL", name: "Human approval", config, nextStepId: "finish" },
      { id: "finish", type: "SET_VALUE", name: "Finish", config: { value: { kind: "literal", value: "after-approval" } } },
    ],
  };
}

async function waitForStatus(runId: string, statuses: string[]) {
  const db = getDatabase();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await getWorkflowRunRecord(runId, db);
    if (run && statuses.includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for workflow run ${runId} to reach ${statuses.join(", ")}.`);
}

async function waitForApproval(runId: string) {
  await waitForStatus(runId, ["WAITING_APPROVAL"]);
  const db = getDatabase();
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [request] = await db.select().from(workflowApprovalRequests).where(and(eq(workflowApprovalRequests.workflowRunId, runId), eq(workflowApprovalRequests.status, "PENDING"))).limit(1);
    if (request) return request;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for approval request for ${runId}.`);
}

async function dispatch() {
  await dispatchPendingWorkflowRuns({ db: getDatabase(), dispatcherId: `approval-dispatcher-${randomUUID()}` });
}

describeIntegration("durable human workflow approvals", () => {
  const db = getDatabase();
  const ownerId = `approval-owner-${randomUUID()}`;
  const adminId = `approval-admin-${randomUUID()}`;
  const memberId = `approval-member-${randomUUID()}`;
  const workspaceId = randomUUID();
  let worker: Worker | undefined;
  let workerConnection: ReturnType<typeof createQueueWorkerConnection> | undefined;

  beforeAll(async () => {
    await db.insert(user).values([
      { id: ownerId, name: "Approval Owner", email: `${ownerId}@example.test`, emailVerified: true },
      { id: adminId, name: "Approval Admin", email: `${adminId}@example.test`, emailVerified: true },
      { id: memberId, name: "Approval Member", email: `${memberId}@example.test`, emailVerified: true },
    ]);
    await db.insert(workspaces).values({ id: workspaceId, name: "Approval Integration", slug: ownerId, createdBy: ownerId });
    await db.insert(workspaceMembers).values([
      { workspaceId, userId: ownerId, role: "OWNER" },
      { workspaceId, userId: adminId, role: "ADMIN" },
      { workspaceId, userId: memberId, role: "MEMBER" },
    ]);
    workerConnection = createQueueWorkerConnection();
    worker = new Worker(WORKFLOW_QUEUE_NAME, async (job) => execute(job.data.runId), { connection: workerConnection, concurrency: 1 });
  });

  afterAll(async () => {
    await worker?.close();
    await workerConnection?.quit();
    await closeWorkflowQueue();
    await closeQueueConnection();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, adminId));
    await db.delete(user).where(eq(user.id, memberId));
    await closeDatabase();
  });

  it("pauses manual runs, resumes only after approval, and keeps prior steps single-run", async () => {
    const workflow = await createWorkflow(ownerId, { workspaceId, name: "Manual approval workflow", description: "integration", definition, enabled: true }, db);
    const run = await createWorkflowRun(ownerId, workflow.id, { secret: "must-not-enter-approval-context" }, undefined, db);
    await dispatch();
    const request = await waitForApproval(run.id);
    expect(request.safeContext).toMatchObject({ origin: "manual", completedStepCount: 1 });
    expect(JSON.stringify(request.safeContext)).not.toContain("must-not-enter-approval-context");

    const before = await db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, run.id));
    expect(before.filter((step) => step.stepId === "start")).toHaveLength(1);
    expect(before.find((step) => step.stepId === "approval")?.status).toBe("WAITING_APPROVAL");

    const approved = await decideWorkflowApproval(adminId, request.id, "approved", null, db);
    expect(approved.status).toBe("APPROVED");
    expect((await decideWorkflowApproval(adminId, request.id, "approved", null, db)).id).toBe(request.id);
    const [continuation] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, run.id)).limit(1);
    expect(continuation?.status).toBe("QUEUED");
    const [dispatchRow] = await db.select().from(workflowRunDispatches).where(eq(workflowRunDispatches.runId, run.id)).limit(1);
    expect(dispatchRow?.dispatchGeneration).toBe(1);
    await dispatch();
    const completed = await waitForStatus(run.id, ["COMPLETED"]);
    expect(completed.output).toBe("after-approval");
    const after = await db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, run.id));
    expect(after.filter((step) => step.stepId === "start")).toHaveLength(1);
    expect(after.filter((step) => step.stepId === "finish")).toHaveLength(1);
    expect(after.find((step) => step.stepId === "approval")?.safeOutput).toEqual({ decision: "approved" });
  });

  it("enforces current roles, rejects members, and rejects a workflow safely", async () => {
    const workflow = await createWorkflow(ownerId, { workspaceId, name: "Role approval workflow", description: "integration", definition: definitionWithApproval({ requiredRole: "OWNER" }), enabled: true }, db);
    const run = await createWorkflowRun(ownerId, workflow.id, {}, undefined, db);
    await dispatch();
    const request = await waitForApproval(run.id);
    await expect(decideWorkflowApproval(adminId, request.id, "rejected", null, db)).rejects.toMatchObject({ code: "WORKFLOW_APPROVAL_FORBIDDEN" });
    await expect(decideWorkflowApproval(memberId, request.id, "rejected", null, db)).rejects.toMatchObject({ code: "WORKSPACE_FORBIDDEN" });
    const rejected = await decideWorkflowApproval(ownerId, request.id, "rejected", "not approved", db);
    expect(rejected.status).toBe("REJECTED");
    const terminal = await waitForStatus(run.id, ["REJECTED"]);
    expect(terminal.errorCode).toBe("WORKFLOW_APPROVAL_REJECTED");
  });

  it("expires lazily, cancels waiting runs, and resolves decision races once", async () => {
    const workflow = await createWorkflow(ownerId, { workspaceId, name: "Recovery approval workflow", description: "integration", definition: definitionWithApproval({ requiredRole: "ADMIN", expiresAfterSeconds: 60 }), enabled: true }, db);
    const expiryRun = await createWorkflowRun(ownerId, workflow.id, {}, undefined, db);
    await dispatch();
    const expiryRequest = await waitForApproval(expiryRun.id);
    await db.update(workflowApprovalRequests).set({ expiresAt: new Date(expiryRequest.createdAt.getTime() + 1) }).where(eq(workflowApprovalRequests.id, expiryRequest.id));
    await expect(decideWorkflowApproval(adminId, expiryRequest.id, "approved", null, db, new Date(expiryRequest.createdAt.getTime() + 2_000))).rejects.toMatchObject({ code: "WORKFLOW_APPROVAL_EXPIRED" });
    const expired = await waitForStatus(expiryRun.id, ["EXPIRED"]);
    expect(expired.errorCode).toBe("WORKFLOW_APPROVAL_EXPIRED");

    const scheduledExpiryRun = await createWorkflowRun(ownerId, workflow.id, {}, undefined, db);
    await dispatch();
    const scheduledExpiryRequest = await waitForApproval(scheduledExpiryRun.id);
    await db.update(workflowApprovalRequests).set({ expiresAt: new Date(scheduledExpiryRequest.createdAt.getTime() + 1) }).where(eq(workflowApprovalRequests.id, scheduledExpiryRequest.id));
    expect(await expireWorkflowApprovals(db, new Date(scheduledExpiryRequest.createdAt.getTime() + 2_000))).toBe(1);
    expect((await waitForStatus(scheduledExpiryRun.id, ["EXPIRED"])).errorCode).toBe("WORKFLOW_APPROVAL_EXPIRED");

    const cancelRun = await createWorkflowRun(ownerId, workflow.id, {}, undefined, db);
    await dispatch();
    const cancelRequest = await waitForApproval(cancelRun.id);
    const cancelled = await cancelWorkflowRun(ownerId, cancelRun.id, db);
    expect(cancelled.status).toBe("CANCELLED");
    const [cancelledRequest] = await db.select().from(workflowApprovalRequests).where(eq(workflowApprovalRequests.id, cancelRequest.id)).limit(1);
    expect(cancelledRequest?.status).toBe("CANCELLED");

    const raceRun = await createWorkflowRun(ownerId, workflow.id, {}, undefined, db);
    await dispatch();
    const raceRequest = await waitForApproval(raceRun.id);
    const race = await Promise.allSettled([
      decideWorkflowApproval(adminId, raceRequest.id, "approved", null, db),
      decideWorkflowApproval(ownerId, raceRequest.id, "rejected", null, db),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [winner] = await db.select().from(workflowApprovalRequests).where(eq(workflowApprovalRequests.id, raceRequest.id)).limit(1);
    expect(["APPROVED", "REJECTED"]).toContain(winner?.status);
  });

  it("pauses schedule and webhook origins through the existing automation principals", async () => {
    const workflow = await createWorkflow(ownerId, { workspaceId, name: "Origin approval workflow", description: "integration", definition, enabled: true }, db);
    const schedule = await createWorkflowSchedule(ownerId, { workspaceId, workflowId: workflow.id, schedule: { type: "ONE_TIME", runAt: new Date(Date.now() - 5_000).toISOString(), timezone: "UTC", misfirePolicy: "FIRE_ONCE", input: {} } }, db);
    await processDueSchedules({ now: new Date(), graceSeconds: 60, batchSize: 5 }, db);
    await dispatch();
    const [occurrence] = await db.select().from(workflowScheduleOccurrences).where(eq(workflowScheduleOccurrences.scheduleId, schedule.id)).limit(1);
    const [scheduledRun] = occurrence?.workflowRunId ? await db.select().from(workflowRuns).where(eq(workflowRuns.id, occurrence.workflowRunId)).limit(1) : [];
    expect(scheduledRun).toBeTruthy();
    const scheduledRequest = await waitForApproval(scheduledRun!.id);
    expect(scheduledRequest.safeContext).toMatchObject({ origin: "schedule" });
    await decideWorkflowApproval(ownerId, scheduledRequest.id, "approved", null, db);
    await dispatch();
    await waitForStatus(scheduledRun!.id, ["COMPLETED"]);

    const webhook = await createWorkflowWebhook(ownerId, { workspaceId, workflowId: workflow.id, name: "Approval integration webhook" }, db);
    const body = JSON.stringify({ event: "approval" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = Buffer.from(body, "utf8");
    const response = await webhookPost(new Request(`http://localhost/api/hooks/${webhook.trigger.publicId}`, { method: "POST", body: rawBody, headers: { "Content-Type": "application/json", "X-Flowyn-Timestamp": timestamp, "X-Flowyn-Signature": createWebhookSignature(webhook.secret, buildSignedMessage(timestamp, rawBody)), "X-Flowyn-Event-Id": `approval-${randomUUID()}` } }), { params: Promise.resolve({ publicId: webhook.trigger.publicId }) });
    expect(response.status).toBe(202);
    await dispatch();
    const [event] = await db.select().from(workflowWebhookEvents).where(eq(workflowWebhookEvents.triggerId, webhook.trigger.id)).limit(1);
    expect(event?.workflowRunId).toBeTruthy();
    const webhookRequest = await waitForApproval(event!.workflowRunId!);
    expect(webhookRequest.safeContext).toMatchObject({ origin: "webhook" });
    await decideWorkflowApproval(ownerId, webhookRequest.id, "rejected", null, db);
  });
});

async function execute(runId: string) {
  return executeWorkflowRun({ runId, workerId: "approval-integration-worker" });
}

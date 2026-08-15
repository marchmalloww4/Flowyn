import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDatabase, auditLogs, integrationActionRuns, integrationCredentials, user, workflowApprovalRequests, workflowStepRuns, workspaceMembers, workspaces } from "@/lib/database";
import { createIntegrationCredential } from "@/lib/integrations/credentials";
import { transitionIntegrationAction } from "@/lib/integrations/actions";
import { classifyWorkflowError, WorkflowStepError } from "@/lib/workflows/errors";
import { createWorkflow, createWorkflowRun, getWorkflowRunRecord } from "@/lib/workflows/service";
import { decideWorkflowApproval } from "@/lib/workflows/approval-service";
import { dispatchPendingWorkflowRuns } from "@/lib/workflows/outbox";
import { startWorkflowWorker } from "@/lib/workflows/worker";
import { closeQueueConnection } from "@/lib/queue/connection";
import { closeWorkflowQueue, bullmqWorkflowJobId, getWorkflowQueue } from "@/lib/workflows/queue";
import { getEnv, resetEnvForTests } from "@/lib/env";
import { logInfo } from "@/lib/observability/logger";
import { sanitizeAuditMetadata } from "@/lib/audit/service";
import { createDefaultToolRegistry } from "@/lib/agents/registry";
import type { WorkflowDefinition } from "@/lib/workflows/types";

const fullPathEnabled = process.env.RUN_SLACK_FULL_PATH_INTEGRATION === "1" ? describe : describe.skip;
const token = process.env.INTEGRATION_TEST_SLACK_TOKEN;
const channel = process.env.INTEGRATION_TEST_SLACK_CHANNEL;
const humanApproval = process.env.INTEGRATION_TEST_SLACK_HUMAN_APPROVAL;

async function waitForRun(runId: string, statuses: string[], db: ReturnType<typeof getDatabase>) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const run = await getWorkflowRunRecord(runId, db);
    if (run && statuses.includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for workflow run ${runId} to reach ${statuses.join(", ")}.`);
}

async function waitForApproval(runId: string, db: ReturnType<typeof getDatabase>) {
  await waitForRun(runId, ["WAITING_APPROVAL"], db);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [request] = await db.select().from(workflowApprovalRequests)
      .where(and(eq(workflowApprovalRequests.workflowRunId, runId), eq(workflowApprovalRequests.status, "PENDING")))
      .limit(1);
    if (request) return request;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for approval request for ${runId}.`);
}

const definition = (credentialId: string): WorkflowDefinition => ({
  schemaVersion: 1,
  entryStepId: "start",
  steps: [
    { id: "start", type: "SET_VALUE", name: "Prepare", config: { value: { kind: "literal", value: "prepared" } }, nextStepId: "approval" },
    { id: "approval", type: "APPROVAL", name: "Human approval", config: { requiredRole: "OWNER", review: { kind: "literal", value: "Approve one synthetic Slack qualification message." } }, nextStepId: "slack" },
    { id: "slack", type: "INTEGRATION_ACTION", name: "Post qualification message", config: { connectorId: "slack", credentialId, operation: "post_message", input: { channel: { kind: "literal", value: channel ?? "" }, text: { kind: "literal", value: "" } } } },
  ],
});

fullPathEnabled("full-path real Slack integration", () => {
  const db = getDatabase();
  const userId = `slack-full-path-${randomUUID()}`;
  const workspaceId = randomUUID();
  const idempotencyKey = `slack-full-path-${randomUUID()}`;
  const message = `Flowyn M15 full-path Slack qualification ${randomUUID()}`;
  let worker: Awaited<ReturnType<typeof startWorkflowWorker>> | undefined;
  let workspaceCreated = false;

  beforeAll(async () => {
    if (!token || !channel) throw new Error("RUN_SLACK_FULL_PATH_INTEGRATION=1 requires INTEGRATION_TEST_SLACK_TOKEN and INTEGRATION_TEST_SLACK_CHANNEL.");
    if (humanApproval !== "1") throw new Error("RUN_SLACK_FULL_PATH_INTEGRATION=1 requires INTEGRATION_TEST_SLACK_HUMAN_APPROVAL=1.");
    process.env.INTEGRATION_EGRESS_ENABLED = "true";
    resetEnvForTests();
    await db.insert(user).values({ id: userId, name: "M15 Slack Qualification", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "M15 Slack Qualification", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
    workspaceCreated = true;
  });

  afterAll(async () => {
    try {
      await worker?.close();
      await closeWorkflowQueue();
      await closeQueueConnection();
      if (workspaceCreated) await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    } finally {
      process.env.INTEGRATION_EGRESS_ENABLED = "false";
      resetEnvForTests();
      await closeDatabase();
    }
  });

  it("runs one approved message through the encrypted vault, worker, durable action, and redacted audit path", async () => {
    const credential = await createIntegrationCredential(userId, { workspaceId, connectorId: "slack", name: "M15 dedicated Slack", secret: { apiToken: token } }, db);
    const [storedCredential] = await db.select().from(integrationCredentials).where(eq(integrationCredentials.id, credential.id)).limit(1);
    expect(storedCredential).toBeTruthy();
    expect(storedCredential?.encryptedSecretMaterial).not.toContain(token);
    expect(JSON.stringify(credential)).not.toContain(token);

    const workflow = await createWorkflow(userId, {
      workspaceId,
      name: "M15 full-path Slack workflow",
      description: "Dedicated release qualification",
      definition: {
        ...definition(credential.id),
        steps: definition(credential.id).steps.map((step) => step.id === "slack" && step.type === "INTEGRATION_ACTION"
          ? { ...step, config: { ...step.config, input: { channel: { kind: "literal", value: channel! }, text: { kind: "literal", value: message } } } }
          : step),
      },
      enabled: true,
    }, db);
    const run = await createWorkflowRun(userId, workflow.id, { qualification: "m15" }, idempotencyKey, db);
    expect(JSON.stringify(run.definitionSnapshot)).not.toContain(token);

    let providerCalls = 0;
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((...args) => {
      const target = args[0];
      if (typeof target === "string" && target === "https://slack.com/api/chat.postMessage") providerCalls += 1;
      return realFetch(...args);
    });

    try {
      worker = await startWorkflowWorker({ workerId: `m15-slack-worker-${randomUUID()}`, concurrency: 1 });
      await dispatchPendingWorkflowRuns({ db, dispatcherId: `m15-slack-dispatcher-${randomUUID()}` });
      const request = await waitForApproval(run.id, db);
      expect(request.requiredRole).toBe("OWNER");
      expect(request.status).toBe("PENDING");
      expect(JSON.stringify(request.safeContext)).not.toContain(token);

      const approved = await decideWorkflowApproval(userId, request.id, "approved", "Dedicated M15 qualification approval", db);
      expect(approved.status).toBe("APPROVED");
      await dispatchPendingWorkflowRuns({ db, dispatcherId: `m15-slack-dispatcher-${randomUUID()}` });
      const completed = await waitForRun(run.id, ["COMPLETED"], db);
      expect(completed.status).toBe("COMPLETED");

      const replay = await import("@/lib/workflows/executor").then(({ executeWorkflowRun }) => executeWorkflowRun({ runId: run.id, workerId: "m15-slack-replay", db }));
      expect(replay.status).toBe("COMPLETED");
      expect(providerCalls).toBe(1);

      const actions = await db.select().from(integrationActionRuns).where(eq(integrationActionRuns.workflowRunId, run.id));
      expect(actions).toHaveLength(1);
      const [action] = actions;
      expect(action).toMatchObject({ status: "SUCCEEDED", attempt: 1, connectorId: "slack", operation: "post_message", credentialId: credential.id });
      expect(JSON.stringify(action)).not.toContain(token);
      expect(transitionIntegrationAction("IN_FLIGHT", "unknown_provider_outcome")).toEqual({ status: "AMBIGUOUS", retryable: false });
      expect(classifyWorkflowError(new WorkflowStepError("INTEGRATION_PROVIDER_AMBIGUOUS", 502, "ambiguous", false))).toMatchObject({ retryable: false });

      const steps = await db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, run.id));
      expect(steps.find((step) => step.stepId === "approval")?.safeOutput).toEqual({ decision: "approved" });
      expect(JSON.stringify(steps)).not.toContain(token);

      const audits = await db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId));
      expect(audits.map((audit) => audit.action)).toEqual(expect.arrayContaining(["workflow_approval.approved", "integration_action.started", "integration_action.succeeded"]));
      expect(JSON.stringify(audits)).not.toContain(token);

      const queueJob = await getWorkflowQueue().getJob(bullmqWorkflowJobId(run.id));
      expect(JSON.stringify(queueJob?.data ?? {})).not.toContain(token);

      const logger = vi.spyOn(console, "log").mockImplementation(() => undefined);
      logInfo("m15.full_path.redaction", { token, credential: token });
      expect(String(logger.mock.calls.at(-1)?.[0] ?? "")).not.toContain(token);
      logger.mockRestore();
      expect(JSON.stringify(sanitizeAuditMetadata({ token, credential: token, safe: "ok" }))).not.toContain(token);
      expect(createDefaultToolRegistry().getPublicDefinitions(["slack_post_message"], {})).toEqual([]);
      expect(getEnv().INTEGRATION_EGRESS_ENABLED).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      await worker?.close();
      worker = undefined;
      process.env.INTEGRATION_EGRESS_ENABLED = "false";
      resetEnvForTests();
    }

    expect(getEnv().INTEGRATION_EGRESS_ENABLED).toBe(false);
  }, 120_000);
});

import { createWorkflowContext, sanitizeWorkflowValue } from "@/lib/workflows/context";
import { classifyWorkflowError } from "@/lib/workflows/errors";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { createDefaultWorkflowStepRegistry, type WorkflowStepRegistry } from "@/lib/workflows/registry";
import { claimWorkflowRun, completeWorkflowStepAndAdvance, createWorkflowStepAttempt, failWorkflowStep, finishWorkflowRun, getWorkflowRunRecord, renewWorkflowRunLease, resolveWorkflowRunPrincipal, type WorkflowRun, type WorkflowStepRun } from "@/lib/workflows/service";
import { getDatabase, workflowStepRuns, type Database } from "@/lib/database";
import { eq } from "drizzle-orm";
import type { JsonValue, WorkflowStep } from "@/lib/workflows/types";
import type { LLMProvider } from "@/lib/ai/types";
import { userExecutionPrincipal } from "@/lib/security/principal";
import { pauseWorkflowForApproval } from "@/lib/workflows/approval-service";
import { transferWorkspaceReservation, releaseWorkspaceReservation } from "@/lib/concurrency/service";
import { recoverExpiredWorkflowDispatch } from "@/lib/workflows/outbox";

export interface ExecuteWorkflowRunOptions {
  runId: string;
  registry?: WorkflowStepRegistry;
  db?: Database;
  provider?: LLMProvider;
  workerId: string;
  dispatchHandoff?: { reservationId: string; reservationOwnerId: string; generation: number; correlationId?: string | null };
}

export interface WorkflowExecutorResult {
  runId: string;
  status: WorkflowRun["status"];
  stepCount: number;
  output: JsonValue | null;
  errorCode: string | null;
}

function result(runId: string, run: WorkflowRun, stepCount: number, output: JsonValue | null = run.output, errorCode = run.errorCode): WorkflowExecutorResult {
  return { runId, status: run.status, stepCount, output, errorCode };
}

function nextStepId(step: WorkflowStep, selected: string | null): string | null {
  if (selected !== null) return selected;
  return step.type === "CONDITION" ? null : step.nextStepId ?? null;
}

function completedOutputs(rows: WorkflowStepRun[]): Record<string, JsonValue> {
  return Object.fromEntries(rows.filter((row) => row.status === "SUCCEEDED" && row.safeOutput !== null).map((row) => [row.stepId, row.safeOutput as JsonValue]));
}

async function loadCompletedSteps(runId: string, db: Database): Promise<WorkflowStepRun[]> {
  return db.select().from(workflowStepRuns).where(eq(workflowStepRuns.workflowRunId, runId));
}

export async function executeWorkflowRun(options: ExecuteWorkflowRunOptions): Promise<WorkflowExecutorResult> {
  const db = options.db ?? getDatabase();
  const registry = options.registry ?? createDefaultWorkflowStepRegistry();
  const policy = getWorkflowExecutionPolicy();
  let adoptedReservation = false;
  let adoptedWorkspaceId: string | undefined;
  const releaseAdoptedReservation = async () => {
    if (!adoptedReservation || !options.dispatchHandoff) return;
    adoptedReservation = false;
    if (!adoptedWorkspaceId) return;
    await releaseWorkspaceReservation({ reservationId: options.dispatchHandoff.reservationId, workspaceId: adoptedWorkspaceId, ownerId: options.workerId }, db);
  };
  if (options.dispatchHandoff) {
    const handoffRun = await getWorkflowRunRecord(options.runId, db);
    adoptedWorkspaceId = handoffRun?.workspaceId;
    const adopted = adoptedWorkspaceId ? await transferWorkspaceReservation({ reservationId: options.dispatchHandoff.reservationId, workspaceId: adoptedWorkspaceId, fromOwnerId: options.dispatchHandoff.reservationOwnerId, toOwnerId: options.workerId, leaseMs: policy.executionLeaseMs }, db) : false;
    if (!adopted) {
      await recoverExpiredWorkflowDispatch({ runId: options.runId, generation: options.dispatchHandoff.generation }, db);
      const current = await getWorkflowRunRecord(options.runId, db);
      return current ? result(options.runId, current, 0) : { runId: options.runId, status: "QUEUED", stepCount: 0, output: null, errorCode: null };
    }
    adoptedReservation = true;
  }
  let claimed;
  try {
    claimed = await claimWorkflowRun(options.runId, options.workerId, db);
  } catch (error) {
    await releaseAdoptedReservation().catch(() => undefined);
    throw error;
  }
  if (!claimed) {
    const current = await getWorkflowRunRecord(options.runId, db);
    await releaseAdoptedReservation().catch(() => undefined);
    if (!current) return { runId: options.runId, status: "FAILED", stepCount: 0, output: null, errorCode: "WORKFLOW_NOT_FOUND" };
    return result(options.runId, current, 0);
  }

  const run = claimed.run;
  const executionToken = claimed.executionToken;
  let principal;
  try {
    principal = run.startedBy ? userExecutionPrincipal(run.startedBy) : await resolveWorkflowRunPrincipal(run, db);
  } catch {
    const failed = await finishWorkflowRun(run.id, executionToken, "FAILED", null, "WORKFLOW_PRINCIPAL_MISSING", db);
    await releaseAdoptedReservation().catch(() => undefined);
    return failed ? result(run.id, failed, 0, null, "WORKFLOW_PRINCIPAL_MISSING") : result(run.id, run, 0, null, "WORKFLOW_PRINCIPAL_MISSING");
  }
  const definition = run.definitionSnapshot;
  const steps = await loadCompletedSteps(run.id, db);
  const stepOutputs = completedOutputs(steps);
  const rootController = new AbortController();
  let totalTimedOut = false;
  let leaseLost = false;
  let cancellationRequested = false;
  let stepCount = 0;
  let lastOutput: JsonValue | null = run.output;
  let currentStepId: string | null = run.currentStepId ?? definition.entryStepId;
  const attemptCounts = new Map<string, number>();
  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    rootController.abort();
  }, policy.totalTimeoutMs);
  const heartbeat = setInterval(() => {
    void renewWorkflowRunLease(run.id, executionToken, db).then((renewed) => {
      if (!renewed) {
        leaseLost = true;
        rootController.abort();
      }
    }).catch(() => {
      leaseLost = true;
      rootController.abort();
    });
  }, Math.max(1000, Math.floor(policy.executionLeaseMs / 3)));
  const cancellationWatcher = setInterval(() => {
    void getWorkflowRunRecord(run.id, db).then((current) => {
      if (current?.status === "CANCEL_REQUESTED") {
        cancellationRequested = true;
        rootController.abort();
      }
    }).catch(() => undefined);
  }, 250);

  try {
    while (currentStepId) {
      const current = await getWorkflowRunRecord(run.id, db);
      if (!current || current.executionToken !== executionToken || current.status === "COMPLETED" || current.status === "FAILED" || current.status === "CANCELLED" || current.status === "TIMED_OUT") {
        leaseLost = true;
        break;
      }
      if (current.status === "CANCEL_REQUESTED") cancellationRequested = true;
      if (cancellationRequested) {
        const cancelled = await finishWorkflowRun(run.id, executionToken, "CANCELLED", lastOutput, "WORKFLOW_CANCELLED", db);
        return cancelled ? result(run.id, cancelled, stepCount, lastOutput, "WORKFLOW_CANCELLED") : result(run.id, current, stepCount, lastOutput, current.errorCode);
      }
      if (totalTimedOut) {
        const timedOut = await finishWorkflowRun(run.id, executionToken, "TIMED_OUT", lastOutput, "WORKFLOW_TIMEOUT", db);
        return timedOut ? result(run.id, timedOut, stepCount, lastOutput, "WORKFLOW_TIMEOUT") : result(run.id, current, stepCount, lastOutput, current.errorCode);
      }
      if (stepCount >= policy.maxSteps) {
        const failed = await finishWorkflowRun(run.id, executionToken, "FAILED", lastOutput, "WORKFLOW_MAX_STEPS", db);
        return failed ? result(run.id, failed, stepCount, lastOutput, "WORKFLOW_MAX_STEPS") : result(run.id, current, stepCount, lastOutput, current.errorCode);
      }
      const step = definition.steps.find((candidate) => candidate.id === currentStepId);
      if (!step) {
        const failed = await finishWorkflowRun(run.id, executionToken, "FAILED", lastOutput, "WORKFLOW_STEP_NOT_FOUND", db);
        return failed ? result(run.id, failed, stepCount, lastOutput, "WORKFLOW_STEP_NOT_FOUND") : result(run.id, current, stepCount, lastOutput, current.errorCode);
      }
      const workflowContext = createWorkflowContext({ triggerInput: run.input, stepOutputs });
      const safeInput = sanitizeWorkflowValue(workflowContext);
      const attempt = (attemptCounts.get(step.id) ?? 0) + 1;
      attemptCounts.set(step.id, attempt);
      const stepRun = await createWorkflowStepAttempt({ runId: run.id, workspaceId: run.workspaceId, stepId: step.id, stepType: step.type, executionToken, safeInput, attempt }, db);
      stepCount += 1;
      try {
        const executor = registry.get(step.type);
        const config = executor.configSchema.parse(step.config);
        const stepResult = await executor.execute({ runId: run.id, workspaceId: run.workspaceId, workflowStepId: step.id, workflowStepRunId: stepRun.id, actorUserId: principal.kind === "user" ? principal.userId : null, principal, workflowId: run.workflowId, workflowVersion: run.workflowVersion, triggerInput: run.input, stepOutputs, abortSignal: rootController.signal, db, provider: options.provider, correlationId: options.dispatchHandoff?.correlationId ?? run.correlationId }, config);
        if (rootController.signal.aborted) {
          if (cancellationRequested) throw new Error("WORKFLOW_CANCELLED");
          if (totalTimedOut) throw new Error("WORKFLOW_TIMEOUT");
          if (leaseLost) break;
        }
        if (stepResult.control?.type === "WAITING_APPROVAL") {
          const paused = await pauseWorkflowForApproval({
            runId: run.id,
            workspaceId: run.workspaceId,
            workflowId: run.workflowId,
            workflowVersion: run.workflowVersion,
            stepRunId: stepRun.id,
            stepId: step.id,
            stepName: step.name,
            executionToken,
            requiredRole: stepResult.control.requiredRole,
            expiresAfterSeconds: stepResult.control.expiresAfterSeconds,
            review: stepResult.control.review,
            safeMetadata: stepResult.safeMetadata,
            completedStepTypes: definition.steps.filter((candidate) => Object.prototype.hasOwnProperty.call(stepOutputs, candidate.id)).map((candidate) => candidate.type),
          }, db);
          if (!paused) {
            leaseLost = true;
            break;
          }
          return result(run.id, paused.run, stepCount, lastOutput, null);
        }
        const output = sanitizeWorkflowValue(stepResult.output);
        const advanced = await completeWorkflowStepAndAdvance({ runId: run.id, stepRunId: stepRun.id, executionToken, nextStepId: nextStepId(step, stepResult.nextStepId), output, safeMetadata: stepResult.safeMetadata, ...(stepResult.agentRunId === undefined ? {} : { agentRunId: stepResult.agentRunId }) }, db);
        if (!advanced) {
          leaseLost = true;
          break;
        }
        stepOutputs[step.id] = output;
        lastOutput = output;
        currentStepId = nextStepId(step, stepResult.nextStepId);
      } catch (error) {
        const classification = classifyWorkflowError(error);
        if (cancellationRequested || (rootController.signal.aborted && !totalTimedOut && !leaseLost && (error instanceof Error && error.message === "WORKFLOW_CANCELLED"))) {
          await failWorkflowStep({ stepRunId: stepRun.id, runId: run.id, executionToken, errorCode: "WORKFLOW_CANCELLED", retryable: false }, db);
          const cancelled = await finishWorkflowRun(run.id, executionToken, "CANCELLED", lastOutput, "WORKFLOW_CANCELLED", db);
          return cancelled ? result(run.id, cancelled, stepCount, lastOutput, "WORKFLOW_CANCELLED") : result(run.id, current, stepCount, lastOutput, current.errorCode);
        }
        if (totalTimedOut) {
          await failWorkflowStep({ stepRunId: stepRun.id, runId: run.id, executionToken, errorCode: "WORKFLOW_TIMEOUT", retryable: false }, db);
          const timedOut = await finishWorkflowRun(run.id, executionToken, "TIMED_OUT", lastOutput, "WORKFLOW_TIMEOUT", db);
          return timedOut ? result(run.id, timedOut, stepCount, lastOutput, "WORKFLOW_TIMEOUT") : result(run.id, current, stepCount, lastOutput, current.errorCode);
        }
        if (leaseLost) break;
        const retry = classification.retryable && attempt <= policy.maxRetries;
        const persisted = await failWorkflowStep({ stepRunId: stepRun.id, runId: run.id, executionToken, errorCode: classification.code, retryable: retry }, db);
        if (!persisted) {
          leaseLost = true;
          break;
        }
        if (retry) continue;
        const failed = await finishWorkflowRun(run.id, executionToken, "FAILED", lastOutput, classification.code, db);
        return failed ? result(run.id, failed, stepCount, lastOutput, classification.code) : result(run.id, current, stepCount, lastOutput, current.errorCode);
      }
    }
    if (leaseLost) {
      const current = await getWorkflowRunRecord(run.id, db);
      return current ? result(run.id, current, stepCount, lastOutput, current.errorCode) : { runId: run.id, status: "RUNNING", stepCount, output: lastOutput, errorCode: null };
    }
    const completed = await finishWorkflowRun(run.id, executionToken, "COMPLETED", lastOutput, null, db);
    return completed ? result(run.id, completed, stepCount, lastOutput, null) : { runId: run.id, status: "RUNNING", stepCount, output: lastOutput, errorCode: null };
  } finally {
    clearTimeout(totalTimer);
    clearInterval(heartbeat);
    clearInterval(cancellationWatcher);
    await releaseAdoptedReservation().catch(() => undefined);
  }
}

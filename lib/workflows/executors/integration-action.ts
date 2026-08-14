import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/service";
import { decryptIntegrationCredentialSecret, resolveActiveIntegrationCredential } from "@/lib/integrations/credentials";
import { markIntegrationCredentialUsed } from "@/lib/integrations/repository";
import { actionIdempotencyKey, claimIntegrationAction, completeIntegrationAction, failIntegrationAction, getIntegrationAction } from "@/lib/integrations/actions";
import { getConnectorOperation } from "@/lib/integrations/registry";
import { integrationActionConfigSchema } from "@/lib/integrations/validation";
import { SlackConnectorError } from "@/lib/integrations/slack";
import { WorkflowStepError } from "@/lib/workflows/errors";
import { createWorkflowContext, resolveWorkflowValue } from "@/lib/workflows/context";
import type { IntegrationActionConfig, WorkflowStepExecutor } from "@/lib/workflows/types";
import { acquireWorkspaceReservation, releaseWorkspaceReservation } from "@/lib/concurrency/service";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";
import { admitIntegrationAction } from "@/lib/usage/service";
import { getEnv } from "@/lib/env";
import { getCorrelationId } from "@/lib/observability/correlation";
import { AppError } from "@/lib/security/errors";

function errorForTerminalAction(status: string, errorCode?: string | null): WorkflowStepError {
  const code = errorCode ?? `INTEGRATION_ACTION_${status}`;
  return new WorkflowStepError(code, 409, "The integration action has already reached a terminal state.", false);
}

async function auditIntegrationAction(context: Parameters<WorkflowStepExecutor<IntegrationActionConfig>["execute"]>[0], actionId: string, action: "started" | "succeeded" | "failed" | "ambiguous" | "cancelled", metadata: Record<string, string | number | boolean | null>): Promise<void> {
  try {
    await recordAuditEvent({ workspaceId: context.workspaceId, actorUserId: context.actorUserId, action: `integration_action.${action}`, resourceType: "integration_action", resourceId: actionId, metadata }, context.db);
  } catch { /* audit is best-effort and never changes provider semantics */ }
}

export async function executeIntegrationAction(context: Parameters<WorkflowStepExecutor<IntegrationActionConfig>["execute"]>[0], config: IntegrationActionConfig) {
  const parsed = integrationActionConfigSchema.parse(config);
  const stepId = context.workflowStepId;
  const stepRunId = context.workflowStepRunId;
  if (!stepId || !stepRunId) throw new WorkflowStepError("INTEGRATION_ACTION_CONTEXT_INVALID", 500, "The integration action execution context is invalid.", false);
  const operationKey = actionIdempotencyKey(context.runId, stepId);
  const existing = await getIntegrationAction(context.runId, stepId, context.workspaceId, context.db);
  if (existing?.status === "SUCCEEDED") {
    if (existing.safeOutput === null) throw new WorkflowStepError("INTEGRATION_ACTION_OUTPUT_MISSING", 500, "The integration action result is unavailable.", false);
    return { output: existing.safeOutput, nextStepId: null, safeMetadata: existing.safeResponseMetadata };
  }
  if (existing && ["FAILED", "AMBIGUOUS", "CANCELLED"].includes(existing.status)) throw errorForTerminalAction(existing.status, existing.errorCode);
  const credential = await resolveActiveIntegrationCredential(context.workspaceId, parsed.credentialId, parsed.connectorId, context.db);
  const reservation = await acquireWorkspaceReservation({
    workspaceId: context.workspaceId,
    operationClass: "INTEGRATION",
    sourceId: operationKey,
    ownerId: stepRunId,
    limit: getWorkspaceUsagePolicy(context.workspaceId).limits.concurrentIntegrationActions,
    leaseMs: Math.min(600_000, Math.max(1_000, getEnv().WORKFLOW_EXECUTION_LEASE_MS)),
  }, context.db);
  if (!reservation.acquired || !reservation.reservation) throw new WorkflowStepError("WORKSPACE_CONCURRENCY_LIMIT", 429, "Workspace integration concurrency limit reached.", true);
  let reservationReleased = false;
  const releaseReservation = async () => {
    if (reservationReleased) return;
    reservationReleased = true;
    await releaseWorkspaceReservation({ reservationId: reservation.reservation?.id ?? "", workspaceId: context.workspaceId, ownerId: stepRunId }, context.db);
  };

  try {
    try {
      await admitIntegrationAction({ workspaceId: context.workspaceId, operationKey: `integration:${operationKey}`, sourceType: "INTEGRATION_ACTION", sourceId: operationKey, correlationId: context.correlationId ?? getCorrelationId(), db: context.db });
    } catch (error) {
      if (error instanceof AppError && ["WORKSPACE_QUOTA_EXCEEDED", "WORKSPACE_RATE_LIMIT_EXCEEDED", "WORKSPACE_RATE_LIMIT_UNAVAILABLE"].includes(error.code)) {
        throw new WorkflowStepError(error.code, error.status, error.message, error.code !== "WORKSPACE_QUOTA_EXCEEDED");
      }
      throw error;
    }

    const claim = await claimIntegrationAction({
      workspaceId: context.workspaceId, workflowRunId: context.runId, workflowStepId: stepId, workflowStepRunId: stepRunId,
      connectorId: parsed.connectorId, operation: parsed.operation, credentialId: credential.id, credentialSecretVersion: credential.secretVersion, correlationId: context.correlationId ?? getCorrelationId() ?? undefined,
    }, context.db);
    if (claim.disposition === "SUCCEEDED") {
      if (claim.action.safeOutput === null) throw new WorkflowStepError("INTEGRATION_ACTION_OUTPUT_MISSING", 500, "The integration action result is unavailable.", false);
      return { output: claim.action.safeOutput, nextStepId: null, safeMetadata: claim.action.safeResponseMetadata };
    }
    if (claim.disposition !== "CLAIMED") throw errorForTerminalAction(claim.disposition, claim.action.errorCode);
    await auditIntegrationAction(context, claim.action.id, "started", { connectorId: parsed.connectorId, operation: parsed.operation, attempt: claim.action.attempt });

    if (context.abortSignal.aborted) {
      await failIntegrationAction({ actionId: claim.action.id, workspaceId: context.workspaceId, errorCode: "INTEGRATION_ACTION_CANCELLED", ambiguous: false, cancelled: true, safeResponseMetadata: { operation: parsed.operation } }, context.db);
      await auditIntegrationAction(context, claim.action.id, "cancelled", { connectorId: parsed.connectorId, operation: parsed.operation, errorCode: "INTEGRATION_ACTION_CANCELLED" });
      throw new WorkflowStepError("INTEGRATION_ACTION_CANCELLED", 409, "The integration action was cancelled before dispatch.", false);
    }

    try {
    const workflowContext = createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs });
    const input = {
      channel: resolveWorkflowValue(parsed.input.channel, workflowContext),
      text: resolveWorkflowValue(parsed.input.text, workflowContext),
    };
    const operation = getConnectorOperation(parsed.connectorId, parsed.operation);
    if (!operation.executor) throw new WorkflowStepError("INTEGRATION_OPERATION_NOT_IMPLEMENTED", 500, "The integration operation is not available.", false);
    const result = await operation.executor.execute({ workspaceId: context.workspaceId, workflowRunId: context.runId, workflowStepId: stepId, workflowStepRunId: stepRunId, idempotencyKey: actionIdempotencyKey(context.runId, stepId), abortSignal: context.abortSignal }, input, decryptIntegrationCredentialSecret(credential));
    let completed;
    try {
      completed = await completeIntegrationAction({ actionId: claim.action.id, workspaceId: context.workspaceId, safeOutput: result.output, safeResponseMetadata: result.safeMetadata, providerRequestId: result.providerRequestId }, context.db);
    } catch {
      throw new WorkflowStepError("INTEGRATION_PROVIDER_AMBIGUOUS", 502, "The external integration outcome could not be durably recorded.", false);
    }
    try { await markIntegrationCredentialUsed(credential.id, context.workspaceId, context.db); } catch { /* last-use telemetry is non-authoritative */ }
    await auditIntegrationAction(context, claim.action.id, "succeeded", { connectorId: parsed.connectorId, operation: parsed.operation, providerRequestId: completed.providerRequestId });
    return { output: completed.safeOutput ?? result.output, nextStepId: null, safeMetadata: completed.safeResponseMetadata };
    } catch (error) {
      const ambiguous = error instanceof SlackConnectorError ? error.ambiguous : error instanceof WorkflowStepError && error.code === "INTEGRATION_PROVIDER_AMBIGUOUS";
      const cancelled = error instanceof SlackConnectorError ? error.cancelled : error instanceof WorkflowStepError && error.code === "INTEGRATION_ACTION_CANCELLED";
      const retryable = error instanceof SlackConnectorError ? error.retryable && !error.ambiguous && !error.cancelled : error instanceof WorkflowStepError ? error.retryable && !ambiguous && !cancelled : false;
      const code = error instanceof SlackConnectorError ? error.code : error instanceof WorkflowStepError ? error.code : ambiguous ? "INTEGRATION_PROVIDER_AMBIGUOUS" : "INTEGRATION_ACTION_FAILED";
      try { await failIntegrationAction({ actionId: claim.action.id, workspaceId: context.workspaceId, errorCode: code, ambiguous, cancelled, safeResponseMetadata: { operation: parsed.operation } }, context.db); } catch { /* preserve the non-retryable provider boundary */ }
      await auditIntegrationAction(context, claim.action.id, cancelled ? "cancelled" : ambiguous ? "ambiguous" : "failed", { connectorId: parsed.connectorId, operation: parsed.operation, errorCode: code });
      throw new WorkflowStepError(code, ambiguous ? 502 : 409, ambiguous ? "The external integration outcome is unknown." : cancelled ? "The integration action was cancelled." : "The integration action failed.", retryable);
    }
  } finally {
    try { await releaseReservation(); } catch { /* release is idempotent and maintenance recovers expiry */ }
  }
}

export const integrationActionExecutor: WorkflowStepExecutor<IntegrationActionConfig> = {
  type: "INTEGRATION_ACTION",
  configSchema: integrationActionConfigSchema as z.ZodType<IntegrationActionConfig>,
  execute: executeIntegrationAction,
};

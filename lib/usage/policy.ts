import { resolveWorkspacePlan } from "@/lib/usage/resolver";
import type { WorkspaceUsageLimits, WorkspaceUsagePolicy } from "@/lib/usage/types";

const SELF_HOSTED_LIMITS: WorkspaceUsageLimits = Object.freeze({
  aiGenerationsPerMinute: 30,
  aiGenerationsPerDay: 500,
  concurrentAgents: 2,
  agentRunsPerDay: 120,
  concurrentWorkflows: 10,
  workflowStartsPerMinute: 60,
  workflowStartsPerDay: 1000,
  acceptedWebhooksPerMinute: 300,
  activeSchedules: 50,
  knowledgeDocuments: 100,
  knowledgeCharacters: 10_000_000,
  integrationCredentials: 20,
  concurrentIntegrationActions: 2,
  integrationActionsPerMinute: 30,
  integrationActionsPerDay: 300,
});

function boundedSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label} is outside the supported operation-key bounds.`);
  }
  return normalized.replaceAll(":", "_");
}

export function getWorkspaceUsagePolicy(workspaceId: string): WorkspaceUsagePolicy {
  return {
    plan: resolveWorkspacePlan(workspaceId),
    workspaceId,
    limits: { ...SELF_HOSTED_LIMITS },
  };
}

export function workflowStartOperationKey(runId: string): string {
  return `workflow-start:${boundedSegment(runId, "Workflow run ID")}`;
}

export function webhookOperationKey(triggerId: string, dedupeKey: string): string {
  return `webhook:${boundedSegment(triggerId, "Webhook trigger ID")}:${boundedSegment(dedupeKey, "Webhook dedupe key")}`;
}

export function workflowAiOperationKey(runId: string, stepId: string): string {
  return `workflow-ai:${boundedSegment(runId, "Workflow run ID")}:${boundedSegment(stepId, "Workflow step ID")}`;
}

export function agentDecisionOperationKey(agentRunId: string, stepNumber: number): string {
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 1000) throw new Error("Agent step number is outside the supported operation-key bounds.");
  return `agent-ai:${boundedSegment(agentRunId, "Agent run ID")}:${stepNumber}`;
}

export function agentRunOperationKey(sourceId: string): string {
  return `agent-start:${boundedSegment(sourceId, "Agent run source ID")}`;
}

export function integrationOperationKey(actionId: string): string {
  return `integration:${boundedSegment(actionId, "Integration action ID")}`;
}

export function directAiOperationKey(requestId: string): string {
  return `direct-ai:${boundedSegment(requestId, "AI request ID")}`;
}

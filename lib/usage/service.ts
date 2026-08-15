import type { Database, WorkspaceUsageMetric } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { admitWorkspaceUsage, dayBucketStart, minuteBucketStart } from "@/lib/usage/admission";
import { getWorkspaceUsagePolicy } from "@/lib/usage/policy";
import { consumeWorkspaceRateLimit, type WorkspaceRateLimitRedis } from "@/lib/usage/rate-limit";
import { getUsageRateLimitRedis } from "@/lib/usage/redis";
import { metrics } from "@/lib/observability/metrics";

export interface WorkspaceOperationAdmissionInput {
  workspaceId: string;
  operationKey: string;
  sourceType: string;
  sourceId?: string | null;
  correlationId?: string | null;
  now?: Date;
  db?: Database;
  redis?: WorkspaceRateLimitRedis;
}

async function admitOperation(input: WorkspaceOperationAdmissionInput & {
  operationClass: string;
  rateLimit?: number;
  metric: WorkspaceUsageMetric;
  dailyLimit?: number;
  minuteLimit?: number;
}): Promise<void> {
  const now = input.now ?? new Date();
  const redis = input.redis ?? getUsageRateLimitRedis();
  if (input.rateLimit !== undefined) {
    const rate = await consumeWorkspaceRateLimit(input.workspaceId, input.operationClass, { redis, limit: input.rateLimit, now: now.getTime() });
    if (!rate.allowed) {
      metrics.increment("flowyn_admission_decisions_total", { operation: input.operationClass, outcome: "rate_limited" });
      throw new AppError("WORKSPACE_RATE_LIMIT_EXCEEDED", 429, "Workspace operation rate limit exceeded.");
    }
  }

  const limit = input.dailyLimit ?? input.minuteLimit;
  if (!limit) throw new Error("Workspace usage admission requires a durable limit.");
  const bucketStart = input.dailyLimit ? dayBucketStart(now) : minuteBucketStart(now);
  const admissionInput = {
    workspaceId: input.workspaceId,
    metric: input.metric,
    operationKey: input.operationKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    bucketStart,
    limit,
    now,
  };
  if (input.db) await admitWorkspaceUsage(admissionInput, input.db);
  else await admitWorkspaceUsage(admissionInput);
  metrics.increment("flowyn_admission_decisions_total", { operation: input.operationClass, outcome: "admitted" });
}

export function admitAiGeneration(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "AI", rateLimit: limits.aiGenerationsPerMinute, metric: "AI_GENERATION_DAY", dailyLimit: limits.aiGenerationsPerDay });
}

export function admitAgentDecision(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "AI", rateLimit: limits.aiGenerationsPerMinute, metric: "AI_GENERATION_DAY", dailyLimit: limits.aiGenerationsPerDay });
}

export function admitAgentRun(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "AGENT", metric: "AGENT_RUN_DAY", dailyLimit: limits.agentRunsPerDay });
}

export function admitWorkflowStart(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "WORKFLOW", rateLimit: limits.workflowStartsPerMinute, metric: "WORKFLOW_START_DAY", dailyLimit: limits.workflowStartsPerDay });
}

export function admitWorkflowAiGeneration(input: WorkspaceOperationAdmissionInput): Promise<void> {
  return admitAiGeneration(input);
}

export function admitIntegrationAction(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "INTEGRATION", rateLimit: limits.integrationActionsPerMinute, metric: "INTEGRATION_ACTION_DAY", dailyLimit: limits.integrationActionsPerDay });
}

export function admitAcceptedWebhook(input: WorkspaceOperationAdmissionInput): Promise<void> {
  const limits = getWorkspaceUsagePolicy(input.workspaceId).limits;
  return admitOperation({ ...input, operationClass: "WEBHOOK", rateLimit: limits.acceptedWebhooksPerMinute, metric: "WEBHOOK_ACCEPTED_MINUTE", minuteLimit: limits.acceptedWebhooksPerMinute });
}

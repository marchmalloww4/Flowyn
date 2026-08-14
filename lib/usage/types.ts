export type WorkspacePlan = "SELF_HOSTED";

export interface WorkspaceUsageLimits {
  aiGenerationsPerMinute: number;
  aiGenerationsPerDay: number;
  concurrentAgents: number;
  agentRunsPerDay: number;
  concurrentWorkflows: number;
  workflowStartsPerMinute: number;
  workflowStartsPerDay: number;
  acceptedWebhooksPerMinute: number;
  activeSchedules: number;
  knowledgeDocuments: number;
  knowledgeCharacters: number;
  integrationCredentials: number;
  concurrentIntegrationActions: number;
  integrationActionsPerMinute: number;
  integrationActionsPerDay: number;
}

export interface WorkspaceUsagePolicy {
  plan: WorkspacePlan;
  workspaceId: string;
  limits: WorkspaceUsageLimits;
}

export interface UsageOperationIdentity {
  operationKey: string;
  sourceType: string;
  sourceId?: string | null;
  correlationId?: string | null;
}

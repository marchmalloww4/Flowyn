import type { ZodType } from "zod";
import type { JsonValue, WorkflowValueExpression } from "@/lib/workflows/types";

export type ConnectorId = "slack";
export type ConnectorAuthType = "API_TOKEN";
export type ConnectorOperationId = "post_message";
export type StaticEgressTarget = "slack.chat.post_message";

export type IntegrationActionStatus = "PENDING" | "IN_FLIGHT" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS" | "CANCELLED";
export type ConnectorRisk = "EXTERNAL_SIDE_EFFECT";

export interface ConnectorRetryPolicy {
  maxProviderRetries: number;
  retryableStatusCodes: readonly number[];
  ambiguousStatusCodes: readonly number[];
}

export interface ConnectorOperationDefinition<TInput, TOutput> {
  id: ConnectorOperationId;
  displayName: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  risk: ConnectorRisk;
  requiresApproval: boolean;
  retryPolicy: ConnectorRetryPolicy;
  executor?: ConnectorExecutor;
}

export interface ConnectorExecutor {
  connectorId: ConnectorId;
  operation: ConnectorOperationId;
  execute(context: TrustedIntegrationContext, input: unknown, credential: unknown): Promise<SafeIntegrationResult>;
}

export interface ConnectorDefinition {
  id: ConnectorId;
  displayName: string;
  authType: ConnectorAuthType;
  credentialSchema: ZodType<IntegrationSecretMaterial>;
  operations: Record<ConnectorOperationId, ConnectorOperationDefinition<unknown, unknown>>;
}

export interface TrustedIntegrationContext {
  workspaceId: string;
  workflowRunId: string;
  workflowStepId: string;
  workflowStepRunId: string;
  idempotencyKey: string;
  abortSignal: AbortSignal;
}

export interface SlackPostMessageInput {
  channel: string;
  text: string;
}

export interface SlackPostMessageOutput {
  provider: "slack";
  channel: string;
  providerMessageId: string;
}

export type SafeMetadataValue = string | number | boolean | null;
export type SafeMetadata = Record<string, SafeMetadataValue>;

export interface SafeIntegrationResult {
  output: JsonValue;
  safeMetadata: SafeMetadata;
  providerRequestId: string | null;
}

export interface IntegrationActionConfig {
  connectorId: "slack";
  credentialId: string;
  operation: "post_message";
  input: {
    channel: WorkflowValueExpression;
    text: WorkflowValueExpression;
  };
}

export interface IntegrationSecretMaterial {
  apiToken: string;
}

export interface IntegrationCatalogOperation {
  id: ConnectorOperationId;
  displayName: string;
  risk: ConnectorRisk;
  requiresApproval: boolean;
}

export interface IntegrationCatalogEntry {
  id: ConnectorId;
  displayName: string;
  authType: ConnectorAuthType;
  operations: IntegrationCatalogOperation[];
}

export interface IntegrationCredentialSafe {
  id: string;
  workspaceId: string;
  connectorId: ConnectorId;
  name: string;
  keyVersion: string;
  secretVersion: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
  deletedAt: Date | null;
  lastUsedAt: Date | null;
}

export type WebhookEventStatus = "TRIGGERED" | "SKIPPED" | "FAILED";

export type WebhookSkipReason = "WORKFLOW_DISABLED" | "WORKFLOW_DELETED";

export interface WebhookDedupeKey {
  key: string;
  externalEventIdHash: string | null;
  dedupeWindowStart: Date | null;
}

export interface WebhookSafeTrigger {
  id: string;
  workspaceId: string;
  workflowId: string;
  publicId: string;
  endpointUrl?: string;
  name: string;
  enabled: boolean;
  secretVersion: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface WebhookSafeEvent {
  id: string;
  workspaceId: string;
  triggerId: string;
  externalEventIdHash: string | null;
  payloadSha256: string;
  payloadBytes: number;
  contentType: string;
  secretVersion: number;
  status: WebhookEventStatus;
  reasonCode: string | null;
  workflowRunId: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  lastSeenAt: Date;
  duplicateCount: number;
  expiresAt: Date;
}

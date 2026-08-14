import { auditLogs, getDatabase, type Database } from "@/lib/database";

export type AuditAction =
  | "workspace.created"
  | "workspace.updated"
  | "workspace.deleted"
  | "membership.added"
  | "membership.role_changed"
  | "membership.removed"
  | "membership.left"
  | "brand.created"
  | "brand.updated"
  | "brand.deleted"
  | "knowledge.created"
  | "knowledge.updated"
  | "knowledge.deleted"
  | "knowledge.reindexed"
  | "agent.created"
  | "agent.updated"
  | "agent.deleted"
  | "agent.run_started"
  | "agent.run_completed"
  | "agent.run_failed"
  | "workflow.created"
  | "workflow.updated"
  | "workflow.deleted"
  | "workflow.enabled"
  | "workflow.disabled"
  | "workflow.run_queued"
  | "workflow.run_started"
  | "workflow.run_completed"
  | "workflow.run_failed"
  | "workflow.run_cancel_requested"
  | "workflow.run_cancelled"
  | "workflow_approval.created"
  | "workflow_approval.approved"
  | "workflow_approval.rejected"
  | "workflow_approval.expired"
  | "workflow_approval.cancelled"
  | "workflow_schedule.created"
  | "workflow_schedule.updated"
  | "workflow_schedule.enabled"
  | "workflow_schedule.disabled"
  | "workflow_schedule.deleted"
  | "workflow_schedule.triggered"
  | "workflow_schedule.skipped"
  | "workflow_webhook.created"
  | "workflow_webhook.updated"
  | "workflow_webhook.enabled"
  | "workflow_webhook.disabled"
  | "workflow_webhook.secret_rotated"
  | "workflow_webhook.deleted"
  | "integration_credential.created"
  | "integration_credential.updated"
  | "integration_credential.secret_rotated"
  | "integration_credential.revoked"
  | "integration_action.started"
  | "integration_action.succeeded"
  | "integration_action.failed"
  | "integration_action.ambiguous"
  | "integration_action.cancelled";

export type AuditResourceType = "workspace" | "membership" | "brand" | "knowledge" | "agent" | "agent_run" | "workflow" | "workflow_run" | "workflow_schedule" | "workflow_schedule_occurrence" | "workflow_webhook" | "workflow_webhook_event" | "workflow_approval" | "integration_credential" | "integration_action";

const sensitiveKey = /(password|token|secret|credential|api[-_]?key|access[-_]?token|refresh[-_]?token)/i;

export function sanitizeAuditMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const sanitize = (input: unknown, depth: number): unknown => {
    if (depth > 5) return "[truncated]";
    if (Array.isArray(input)) return input.slice(0, 100).map((item) => sanitize(item, depth + 1));
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !sensitiveKey.test(key)).map(([key, nested]) => [key, sanitize(nested, depth + 1)]));
  };
  return sanitize(value, 0) as Record<string, unknown>;
}

export interface AuditEventInput {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(input: AuditEventInput, db: Database = getDatabase()): Promise<void> {
  await db.insert(auditLogs).values({
    workspaceId: input.workspaceId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: sanitizeAuditMetadata(input.metadata ?? {}),
  });
}

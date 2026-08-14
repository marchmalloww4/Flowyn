import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  getDatabase,
  type Database,
  workflowWebhookEvents,
  workflowWebhookTriggers,
} from "@/lib/database";
import type { WebhookSafeEvent, WebhookSafeTrigger } from "@/lib/webhooks/types";
import { normalizeWebhookCleanupBatch } from "@/lib/webhooks/retention";

export type WorkflowWebhookTrigger = typeof workflowWebhookTriggers.$inferSelect;
export type WorkflowWebhookEvent = typeof workflowWebhookEvents.$inferSelect;

export function toSafeWebhookTrigger(row: WorkflowWebhookTrigger): WebhookSafeTrigger {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workflowId: row.workflowId,
    publicId: row.publicId,
    name: row.name,
    enabled: row.enabled,
    secretVersion: row.secretVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toSafeWebhookEvent(row: WorkflowWebhookEvent): WebhookSafeEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    triggerId: row.triggerId,
    externalEventIdHash: row.externalEventIdHash,
    payloadSha256: row.payloadSha256,
    payloadBytes: row.payloadBytes,
    contentType: row.contentType,
    secretVersion: row.secretVersion,
    status: row.status,
    reasonCode: row.reasonCode,
    workflowRunId: row.workflowRunId,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    lastSeenAt: row.lastSeenAt,
    duplicateCount: row.duplicateCount,
    expiresAt: row.expiresAt,
  };
}

export async function getWebhookTriggerByPublicId(publicId: string, db: Database = getDatabase()): Promise<WorkflowWebhookTrigger | undefined> {
  const [trigger] = await db.select().from(workflowWebhookTriggers)
    .where(eq(workflowWebhookTriggers.publicId, publicId))
    .limit(1);
  return trigger;
}

export async function getWebhookTriggerById(triggerId: string, workspaceId?: string, db: Database = getDatabase()): Promise<WorkflowWebhookTrigger | undefined> {
  const conditions = [eq(workflowWebhookTriggers.id, triggerId), isNull(workflowWebhookTriggers.deletedAt)];
  if (workspaceId) conditions.push(eq(workflowWebhookTriggers.workspaceId, workspaceId));
  const [trigger] = await db.select().from(workflowWebhookTriggers).where(and(...conditions)).limit(1);
  return trigger;
}

export async function listWebhookTriggers(workspaceId: string, db: Database = getDatabase()): Promise<WebhookSafeTrigger[]> {
  const rows = await db.select().from(workflowWebhookTriggers)
    .where(and(eq(workflowWebhookTriggers.workspaceId, workspaceId), isNull(workflowWebhookTriggers.deletedAt)))
    .orderBy(desc(workflowWebhookTriggers.updatedAt));
  return rows.map(toSafeWebhookTrigger);
}

export async function listWebhookEvents(
  workspaceId: string,
  triggerId: string,
  limit: number,
  db: Database = getDatabase(),
): Promise<WebhookSafeEvent[]> {
  const rows = await db.select().from(workflowWebhookEvents)
    .where(and(eq(workflowWebhookEvents.workspaceId, workspaceId), eq(workflowWebhookEvents.triggerId, triggerId)))
    .orderBy(desc(workflowWebhookEvents.receivedAt), desc(workflowWebhookEvents.id))
    .limit(Math.min(100, Math.max(1, Math.floor(limit))));
  return rows.map(toSafeWebhookEvent);
}

export async function purgeExpiredWebhookEvents(
  now = new Date(),
  batchSize?: number,
  db: Database = getDatabase(),
): Promise<number> {
  const ids = await db.select({ id: workflowWebhookEvents.id })
    .from(workflowWebhookEvents)
    .where(lt(workflowWebhookEvents.expiresAt, now))
    .orderBy(workflowWebhookEvents.expiresAt, workflowWebhookEvents.id)
    .limit(normalizeWebhookCleanupBatch(batchSize));
  if (ids.length === 0) return 0;
  await db.delete(workflowWebhookEvents).where(inArray(workflowWebhookEvents.id, ids.map(({ id }) => id)));
  return ids.length;
}

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, type Database, workflowWebhookTriggers } from "@/lib/database";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/security/errors";
import { getWorkflow } from "@/lib/workflows/service";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret } from "@/lib/security/secrets";
import {
  getWebhookTriggerById,
  listWebhookEvents,
  listWebhookTriggers,
  toSafeWebhookTrigger,
  type WorkflowWebhookTrigger,
} from "@/lib/webhooks/repository";
import { getWebhookEventExpiry } from "@/lib/webhooks/retention";
import { webhookCreateSchema, webhookUpdateSchema } from "@/lib/webhooks/validation";
import type { WebhookSafeEvent, WebhookSafeTrigger } from "@/lib/webhooks/types";

export interface CreateWorkflowWebhookInput {
  workspaceId: string;
  workflowId: string;
  name: string;
}

export type UpdateWorkflowWebhookInput = unknown;

export interface WorkflowWebhookSecretResult {
  trigger: WebhookSafeTrigger;
  secret: string;
}

function webhookConfig() {
  const env = getEnv();
  const encryptionKey = Buffer.from(env.WEBHOOK_SECRET_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) throw new AppError("WEBHOOK_CONFIG_INVALID", 500, "Webhook secret encryption is not configured correctly.");
  return {
    encryptionKey,
    keyVersion: env.WEBHOOK_SECRET_KEY_VERSION,
    retentionDays: env.WEBHOOK_EVENT_RETENTION_DAYS,
  };
}

function notFound(): AppError {
  return new AppError("WORKFLOW_WEBHOOK_NOT_FOUND", 404, "Workflow webhook not found.");
}

function withEndpointUrl(trigger: WebhookSafeTrigger): WebhookSafeTrigger {
  const baseUrl = getEnv().WEBHOOK_PUBLIC_BASE_URL.replace(/\/$/, "");
  return { ...trigger, endpointUrl: `${baseUrl}/api/hooks/${trigger.publicId}` };
}

async function loadTrigger(triggerId: string, db: Database): Promise<WorkflowWebhookTrigger> {
  const trigger = await getWebhookTriggerById(triggerId, undefined, db);
  if (!trigger) throw notFound();
  return trigger;
}

export async function listWorkflowWebhooks(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<WebhookSafeTrigger[]> {
  await requireWorkspaceAction(userId, workspaceId, "workflow_webhook.read", db);
  return (await listWebhookTriggers(workspaceId, db)).map(withEndpointUrl);
}

export async function getWorkflowWebhook(userId: string, triggerId: string, db: Database = getDatabase()): Promise<WebhookSafeTrigger> {
  const trigger = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, trigger.workspaceId, "workflow_webhook.read", db);
  return withEndpointUrl(toSafeWebhookTrigger(trigger));
}

export async function createWorkflowWebhook(userId: string, input: CreateWorkflowWebhookInput, db: Database = getDatabase()): Promise<WorkflowWebhookSecretResult> {
  const parsed = webhookCreateSchema.parse(input);
  await requireWorkspaceAction(userId, parsed.workspaceId, "workflow_webhook.create", db);
  const workflow = await getWorkflow(userId, parsed.workflowId, db);
  if (workflow.workspaceId !== parsed.workspaceId || workflow.deletedAt) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");

  const config = webhookConfig();
  const id = randomUUID();
  const secret = generateWebhookSecret();
  const createdAt = new Date();
  const [created] = await db.insert(workflowWebhookTriggers).values({
    id,
    workspaceId: parsed.workspaceId,
    workflowId: parsed.workflowId,
    publicId: randomBytes(32).toString("base64url"),
    name: parsed.name,
    enabled: true,
    secretCiphertext: encryptWebhookSecret(secret, { encryptionKey: config.encryptionKey, keyVersion: config.keyVersion, triggerId: id, secretVersion: 1 }),
    secretKeyVersion: config.keyVersion,
    secretVersion: 1,
    createdBy: userId,
    createdAt,
    updatedAt: createdAt,
  }).returning();
  if (!created) throw new AppError("WORKFLOW_WEBHOOK_CREATE_FAILED", 500, "Workflow webhook could not be created.");
  await recordAuditEvent({ workspaceId: created.workspaceId, actorUserId: userId, action: "workflow_webhook.created", resourceType: "workflow_webhook", resourceId: created.id, metadata: { workflowId: created.workflowId, name: created.name, secretVersion: created.secretVersion } }, db);
  return { trigger: withEndpointUrl(toSafeWebhookTrigger(created)), secret };
}

export async function updateWorkflowWebhook(userId: string, triggerId: string, input: UpdateWorkflowWebhookInput, db: Database = getDatabase()): Promise<WebhookSafeTrigger> {
  const parsed = webhookUpdateSchema.parse(input);
  const existing = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow_webhook.update", db);
  if (parsed.workflowId) {
    const workflow = await getWorkflow(userId, parsed.workflowId, db);
    if (workflow.workspaceId !== existing.workspaceId || workflow.deletedAt) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  }
  const [updated] = await db.update(workflowWebhookTriggers).set({
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.workflowId === undefined ? {} : { workflowId: parsed.workflowId }),
    updatedAt: new Date(),
  }).where(and(eq(workflowWebhookTriggers.id, existing.id), eq(workflowWebhookTriggers.workspaceId, existing.workspaceId), isNull(workflowWebhookTriggers.deletedAt))).returning();
  if (!updated) throw new AppError("WORKFLOW_WEBHOOK_UPDATE_FAILED", 500, "Workflow webhook could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "workflow_webhook.updated", resourceType: "workflow_webhook", resourceId: updated.id, metadata: { fields: Object.keys(parsed) } }, db);
  return withEndpointUrl(toSafeWebhookTrigger(updated));
}

export async function setWorkflowWebhookEnabled(userId: string, triggerId: string, enabled: boolean, db: Database = getDatabase()): Promise<WebhookSafeTrigger> {
  const existing = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, enabled ? "workflow_webhook.enable" : "workflow_webhook.disable", db);
  const [updated] = await db.update(workflowWebhookTriggers).set({ enabled, updatedAt: new Date() }).where(and(eq(workflowWebhookTriggers.id, existing.id), eq(workflowWebhookTriggers.workspaceId, existing.workspaceId), isNull(workflowWebhookTriggers.deletedAt))).returning();
  if (!updated) throw new AppError("WORKFLOW_WEBHOOK_UPDATE_FAILED", 500, "Workflow webhook could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: enabled ? "workflow_webhook.enabled" : "workflow_webhook.disabled", resourceType: "workflow_webhook", resourceId: updated.id, metadata: { enabled } }, db);
  return withEndpointUrl(toSafeWebhookTrigger(updated));
}

export async function deleteWorkflowWebhook(userId: string, triggerId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow_webhook.delete", db);
  const [deleted] = await db.update(workflowWebhookTriggers).set({ enabled: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(workflowWebhookTriggers.id, existing.id), isNull(workflowWebhookTriggers.deletedAt))).returning();
  if (!deleted) throw new AppError("WORKFLOW_WEBHOOK_DELETE_FAILED", 500, "Workflow webhook could not be deleted.");
  await recordAuditEvent({ workspaceId: deleted.workspaceId, actorUserId: userId, action: "workflow_webhook.deleted", resourceType: "workflow_webhook", resourceId: deleted.id, metadata: { workflowId: deleted.workflowId } }, db);
}

export async function rotateWorkflowWebhookSecret(userId: string, triggerId: string, db: Database = getDatabase()): Promise<WorkflowWebhookSecretResult> {
  const existing = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "workflow_webhook.rotate_secret", db);
  const config = webhookConfig();
  const secret = generateWebhookSecret();
  const secretVersion = existing.secretVersion + 1;
  const [updated] = await db.update(workflowWebhookTriggers).set({
    secretCiphertext: encryptWebhookSecret(secret, { encryptionKey: config.encryptionKey, keyVersion: config.keyVersion, triggerId: existing.id, secretVersion }),
    secretKeyVersion: config.keyVersion,
    secretVersion,
    updatedAt: new Date(),
  }).where(and(eq(workflowWebhookTriggers.id, existing.id), isNull(workflowWebhookTriggers.deletedAt))).returning();
  if (!updated) throw new AppError("WORKFLOW_WEBHOOK_ROTATE_FAILED", 500, "Workflow webhook secret could not be rotated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "workflow_webhook.secret_rotated", resourceType: "workflow_webhook", resourceId: updated.id, metadata: { secretVersion } }, db);
  return { trigger: withEndpointUrl(toSafeWebhookTrigger(updated)), secret };
}

export async function listWorkflowWebhookEvents(userId: string, triggerId: string, limit = 100, db: Database = getDatabase()): Promise<WebhookSafeEvent[]> {
  const trigger = await loadTrigger(triggerId, db);
  await requireWorkspaceAction(userId, trigger.workspaceId, "workflow_webhook.read", db);
  return listWebhookEvents(trigger.workspaceId, trigger.id, limit, db);
}

export function decryptActiveWebhookSecret(trigger: WorkflowWebhookTrigger): string {
  const config = webhookConfig();
  return decryptWebhookSecret(trigger.secretCiphertext, {
    encryptionKey: config.encryptionKey,
    keyVersion: trigger.secretKeyVersion,
    triggerId: trigger.id,
    secretVersion: trigger.secretVersion,
  });
}

export function webhookEventExpiry(receivedAt: Date): Date {
  return getWebhookEventExpiry(receivedAt, webhookConfig().retentionDays);
}

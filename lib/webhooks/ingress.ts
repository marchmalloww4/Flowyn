import { and, eq, sql } from "drizzle-orm";
import { getDatabase, type Database, workflowWebhookEvents, workflows } from "@/lib/database";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/security/errors";
import { webhookAutomationPrincipal } from "@/lib/security/principal";
import { createWebhookWorkflowRun } from "@/lib/workflows/service";
import { workflowRunSchema } from "@/lib/workflows/validation";
import { getWebhookTriggerByPublicId } from "@/lib/webhooks/repository";
import { consumeWebhookRateLimit, type WebhookRateLimitRedis } from "@/lib/webhooks/rate-limit";
import { validateWebhookTimestamp, WEBHOOK_POLICY } from "@/lib/webhooks/policy";
import { buildSignedMessage, createWebhookDedupeKey, createWebhookIdempotencyKey, hashWebhookPayload, normalizeWebhookEventId, verifyWebhookSignature } from "@/lib/webhooks/protocol";
import { decryptActiveWebhookSecret, webhookEventExpiry } from "@/lib/webhooks/service";
import { validateWebhookPayload } from "@/lib/webhooks/validation";
import type { JsonValue } from "@/lib/workflows/types";
import { admitAcceptedWebhook } from "@/lib/usage/service";
import { webhookOperationKey } from "@/lib/usage/policy";
import { getCorrelationId } from "@/lib/observability/correlation";

export interface WebhookIngressInput {
  publicId: string;
  timestamp: string;
  signature: string;
  eventId?: string | null;
  contentType: string;
  rawBody: Uint8Array;
  now?: Date;
  db?: Database;
  redis: WebhookRateLimitRedis;
}

export interface WebhookIngressResult {
  accepted: true;
  duplicate: boolean;
}

function rejected(): AppError {
  return new AppError("WEBHOOK_REJECTED", 401, "Webhook request could not be accepted.");
}

function unavailable(): AppError {
  return new AppError("WEBHOOK_ACCEPTANCE_UNAVAILABLE", 503, "Webhook service is temporarily unavailable.");
}

function normalizeContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(normalized)) throw rejected();
  return "application/json";
}

export async function ingestWebhookDelivery(input: WebhookIngressInput): Promise<WebhookIngressResult> {
  const env = getEnv();
  const db = input.db ?? getDatabase();
  const now = input.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const contentType = normalizeContentType(input.contentType);
  if (input.rawBody.byteLength < 1 || input.rawBody.byteLength > Math.min(WEBHOOK_POLICY.maxBodyBytes, env.WEBHOOK_MAX_BODY_BYTES)) throw rejected();

  const limit = await consumeWebhookRateLimit(input.publicId, {
    redis: input.redis,
    globalLimit: env.WEBHOOK_RATE_LIMIT_GLOBAL_PER_MINUTE,
    triggerLimit: env.WEBHOOK_RATE_LIMIT_TRIGGER_PER_MINUTE,
    now: now.getTime(),
  });
  if (!limit.allowed) throw new AppError("WEBHOOK_RATE_LIMITED", 429, "Webhook rate limit exceeded.");

  const trigger = await getWebhookTriggerByPublicId(input.publicId, db);
  if (!trigger || !trigger.enabled || trigger.deletedAt) throw rejected();

  const timestamp = validateWebhookTimestamp(input.timestamp, nowSeconds, env.WEBHOOK_REPLAY_WINDOW_SECONDS);
  if (!timestamp.ok) throw rejected();

  let secret: string;
  try {
    secret = decryptActiveWebhookSecret(trigger);
  } catch {
    throw unavailable();
  }
  if (!verifyWebhookSignature(secret, buildSignedMessage(input.timestamp, input.rawBody), input.signature)) throw rejected();

  let eventId: string | null;
  let payload: Record<string, unknown>;
  let workflowInput: JsonValue;
  try {
    eventId = normalizeWebhookEventId(input.eventId);
    payload = validateWebhookPayload(input.rawBody);
    workflowInput = workflowRunSchema.parse({ input: payload }).input as JsonValue;
    if (!workflowInput || typeof workflowInput !== "object" || Array.isArray(workflowInput)) throw rejected();
    payload = workflowInput as Record<string, unknown>;
  } catch {
    throw rejected();
  }

  const payloadHash = hashWebhookPayload(payload);
  const dedupe = createWebhookDedupeKey({ eventId, nowSeconds: timestamp.timestamp, replayWindowSeconds: env.WEBHOOK_REPLAY_WINDOW_SECONDS, payloadHash });
  try {
    return await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(workflowWebhookEvents).values({
        workspaceId: trigger.workspaceId,
        triggerId: trigger.id,
        externalEventIdHash: dedupe.externalEventIdHash,
        dedupeKey: dedupe.key,
        dedupeWindowStart: dedupe.dedupeWindowStart,
        payloadSha256: payloadHash,
        payloadBytes: input.rawBody.byteLength,
        contentType,
        secretVersion: trigger.secretVersion,
        status: "TRIGGERED",
        reasonCode: null,
        receivedAt: now,
        lastSeenAt: now,
        duplicateCount: 0,
        expiresAt: webhookEventExpiry(now),
      }).onConflictDoNothing({ target: [workflowWebhookEvents.triggerId, workflowWebhookEvents.dedupeKey] }).returning();

      if (!inserted) {
        const [existing] = await tx.select({ id: workflowWebhookEvents.id }).from(workflowWebhookEvents)
          .where(and(eq(workflowWebhookEvents.triggerId, trigger.id), eq(workflowWebhookEvents.dedupeKey, dedupe.key)))
          .limit(1);
        if (!existing) throw unavailable();
        await tx.update(workflowWebhookEvents).set({ lastSeenAt: now, duplicateCount: sql`${workflowWebhookEvents.duplicateCount} + 1` }).where(eq(workflowWebhookEvents.id, existing.id));
        return { accepted: true, duplicate: true };
      }

      await admitAcceptedWebhook({ workspaceId: trigger.workspaceId, operationKey: webhookOperationKey(trigger.id, dedupe.key), sourceType: "WEBHOOK_EVENT", sourceId: inserted.id, correlationId: getCorrelationId(), db: tx });

      const [workflow] = await tx.select().from(workflows)
        .where(and(eq(workflows.id, trigger.workflowId), eq(workflows.workspaceId, trigger.workspaceId)))
        .limit(1);
      if (!workflow || workflow.deletedAt) {
        await tx.update(workflowWebhookEvents).set({ status: "SKIPPED", reasonCode: "WORKFLOW_DELETED", processedAt: now }).where(eq(workflowWebhookEvents.id, inserted.id));
        return { accepted: true, duplicate: false };
      }
      if (!workflow.enabled) {
        await tx.update(workflowWebhookEvents).set({ status: "SKIPPED", reasonCode: "WORKFLOW_DISABLED", processedAt: now }).where(eq(workflowWebhookEvents.id, inserted.id));
        return { accepted: true, duplicate: false };
      }

      const run = await createWebhookWorkflowRun({
        principal: webhookAutomationPrincipal(trigger.workspaceId, trigger.id, inserted.id),
        webhookTriggerId: trigger.id,
        webhookEventId: inserted.id,
        workspaceId: trigger.workspaceId,
        workflowId: trigger.workflowId,
        input: workflowInput,
        idempotencyKey: createWebhookIdempotencyKey(trigger.id, dedupe.key),
      }, tx);
      await tx.update(workflowWebhookEvents).set({ workflowRunId: run.id, processedAt: now }).where(eq(workflowWebhookEvents.id, inserted.id));
      return { accepted: true, duplicate: false };
    });
  } catch (error) {
    if (error instanceof AppError && ["WEBHOOK_ACCEPTANCE_UNAVAILABLE", "WEBHOOK_RATE_LIMIT_UNAVAILABLE", "WORKSPACE_RATE_LIMIT_UNAVAILABLE", "WORKSPACE_RATE_LIMIT_EXCEEDED", "WORKSPACE_QUOTA_EXCEEDED"].includes(error.code)) throw error;
    throw unavailable();
  }
}

import { createHash, randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDatabase, integrationActionRuns, type Database } from "@/lib/database";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/security/errors";
import { INTEGRATION_ACTION_STATUSES } from "@/lib/integrations/policy";
import type { IntegrationActionStatus, SafeMetadata } from "@/lib/integrations/types";
import type { JsonValue } from "@/lib/workflows/types";

export type IntegrationActionRun = typeof integrationActionRuns.$inferSelect;

export interface ClaimIntegrationActionInput {
  workspaceId: string;
  workflowRunId: string;
  workflowStepId: string;
  workflowStepRunId: string;
  connectorId: string;
  operation: string;
  credentialId: string;
  credentialSecretVersion: number;
  leaseMs?: number;
  now?: Date;
  correlationId?: string | null;
}

export interface IntegrationActionClaim {
  disposition: "CLAIMED" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS" | "CANCELLED" | "IN_FLIGHT";
  action: IntegrationActionRun;
}

export interface CompleteIntegrationActionInput {
  actionId: string;
  workspaceId: string;
  safeOutput: JsonValue;
  safeResponseMetadata: SafeMetadata;
  providerRequestId?: string | null;
  now?: Date;
}

export interface FailIntegrationActionInput {
  actionId: string;
  workspaceId: string;
  errorCode: string;
  ambiguous?: boolean;
  cancelled?: boolean;
  safeResponseMetadata?: SafeMetadata;
  now?: Date;
}

export function actionIdempotencyKey(workflowRunId: string, workflowStepId: string): string {
  return createHash("sha256").update(`${workflowRunId}:${workflowStepId}`, "utf8").digest("hex");
}

export function canTransitionIntegrationAction(from: IntegrationActionStatus, to: IntegrationActionStatus): boolean {
  if (from === "PENDING") return to === "IN_FLIGHT";
  if (from === "IN_FLIGHT") return ["SUCCEEDED", "FAILED", "AMBIGUOUS", "CANCELLED"].includes(to);
  return false;
}

export function transitionIntegrationAction(status: IntegrationActionStatus, event: "claim" | "success" | "failure" | "unknown_provider_outcome" | "cancel"): { status: IntegrationActionStatus; retryable: boolean } {
  if (event === "claim" && status === "PENDING") return { status: "IN_FLIGHT", retryable: false };
  if (event === "success" && status === "IN_FLIGHT") return { status: "SUCCEEDED", retryable: false };
  if (event === "failure" && status === "IN_FLIGHT") return { status: "FAILED", retryable: false };
  if (event === "unknown_provider_outcome" && status === "IN_FLIGHT") return { status: "AMBIGUOUS", retryable: false };
  if (event === "cancel" && status === "IN_FLIGHT") return { status: "CANCELLED", retryable: false };
  return { status, retryable: false };
}

function assertSafePayload(value: unknown, name: string): void {
  try {
    if (JSON.stringify(value).length > 65536) throw new Error(name);
  } catch {
    throw new AppError("INTEGRATION_ACTION_METADATA_INVALID", 400, "Integration action metadata is invalid.");
  }
}

async function getActionById(actionId: string, workspaceId: string, db: Database): Promise<IntegrationActionRun | undefined> {
  const [row] = await db.select().from(integrationActionRuns).where(and(eq(integrationActionRuns.id, actionId), eq(integrationActionRuns.workspaceId, workspaceId))).limit(1);
  return row;
}

export async function getIntegrationAction(workflowRunId: string, workflowStepId: string, workspaceId: string, db: Database = getDatabase()): Promise<IntegrationActionRun | undefined> {
  const [row] = await db.select().from(integrationActionRuns).where(and(eq(integrationActionRuns.workflowRunId, workflowRunId), eq(integrationActionRuns.workflowStepId, workflowStepId), eq(integrationActionRuns.workspaceId, workspaceId))).limit(1);
  return row;
}

function leaseExpiry(now: Date, leaseMs: number): Date {
  return new Date(now.getTime() + Math.min(Math.max(leaseMs, 1000), 600000));
}

async function markStaleRow(row: IntegrationActionRun, now: Date, db: Database): Promise<IntegrationActionRun> {
  const [updated] = await db.update(integrationActionRuns).set({ status: "AMBIGUOUS", errorCode: "INTEGRATION_STALE_IN_FLIGHT", completedAt: now, leaseExpiresAt: null, updatedAt: now }).where(and(eq(integrationActionRuns.id, row.id), eq(integrationActionRuns.status, "IN_FLIGHT"), lt(integrationActionRuns.leaseExpiresAt, now))).returning();
  return updated ?? row;
}

export async function claimIntegrationAction(input: ClaimIntegrationActionInput, db: Database = getDatabase()): Promise<IntegrationActionClaim> {
  const now = input.now ?? new Date();
  const idempotencyKey = actionIdempotencyKey(input.workflowRunId, input.workflowStepId);
  let row = await getIntegrationAction(input.workflowRunId, input.workflowStepId, input.workspaceId, db);
  if (!row) {
    try {
      const [created] = await db.insert(integrationActionRuns).values({
        id: randomUUID(), workspaceId: input.workspaceId, workflowRunId: input.workflowRunId, workflowStepId: input.workflowStepId, workflowStepRunId: input.workflowStepRunId,
        connectorId: input.connectorId, operation: input.operation, credentialId: input.credentialId, credentialSecretVersion: input.credentialSecretVersion,
        idempotencyKey, attempt: 1, status: "IN_FLIGHT", correlationId: input.correlationId ?? null, leaseExpiresAt: leaseExpiry(now, input.leaseMs ?? getEnv().WORKFLOW_EXECUTION_LEASE_MS), startedAt: now, updatedAt: now,
      }).returning();
      if (created) return { disposition: "CLAIMED", action: created };
    } catch {
      row = await getIntegrationAction(input.workflowRunId, input.workflowStepId, input.workspaceId, db);
    }
    if (!row) throw new AppError("INTEGRATION_ACTION_CLAIM_FAILED", 500, "The integration action could not be claimed.");
  }
  if (row.status === "SUCCEEDED" || row.status === "FAILED" || row.status === "AMBIGUOUS" || row.status === "CANCELLED") return { disposition: row.status, action: row };
  if (row.status === "IN_FLIGHT") {
    if (!row.leaseExpiresAt || row.leaseExpiresAt > now) return { disposition: "IN_FLIGHT", action: row };
    const stale = await markStaleRow(row, now, db);
    return { disposition: stale.status === "AMBIGUOUS" ? "AMBIGUOUS" : "IN_FLIGHT", action: stale };
  }
  const [claimed] = await db.update(integrationActionRuns).set({ status: "IN_FLIGHT", workflowStepRunId: input.workflowStepRunId, attempt: row.attempt + 1, leaseExpiresAt: leaseExpiry(now, input.leaseMs ?? getEnv().WORKFLOW_EXECUTION_LEASE_MS), startedAt: row.startedAt ?? now, updatedAt: now }).where(and(eq(integrationActionRuns.id, row.id), eq(integrationActionRuns.status, "PENDING"))).returning();
  return claimed ? { disposition: "CLAIMED", action: claimed } : { disposition: "IN_FLIGHT", action: row };
}

export async function completeIntegrationAction(input: CompleteIntegrationActionInput, db: Database = getDatabase()): Promise<IntegrationActionRun> {
  assertSafePayload(input.safeOutput, "safe output");
  assertSafePayload(input.safeResponseMetadata, "safe metadata");
  const now = input.now ?? new Date();
  const [updated] = await db.update(integrationActionRuns).set({ status: "SUCCEEDED", safeOutput: input.safeOutput, safeResponseMetadata: input.safeResponseMetadata, providerRequestId: input.providerRequestId ?? null, errorCode: null, leaseExpiresAt: null, completedAt: now, updatedAt: now }).where(and(eq(integrationActionRuns.id, input.actionId), eq(integrationActionRuns.workspaceId, input.workspaceId), eq(integrationActionRuns.status, "IN_FLIGHT"))).returning();
  if (updated) return updated;
  const existing = await getActionById(input.actionId, input.workspaceId, db);
  if (existing?.status === "SUCCEEDED") return existing;
  throw new AppError("INTEGRATION_ACTION_STATE_CONFLICT", 409, "The integration action state has already changed.");
}

export async function failIntegrationAction(input: FailIntegrationActionInput, db: Database = getDatabase()): Promise<IntegrationActionRun> {
  assertSafePayload(input.safeResponseMetadata ?? {}, "safe metadata");
  const now = input.now ?? new Date();
  const status: IntegrationActionStatus = input.cancelled ? "CANCELLED" : input.ambiguous ? "AMBIGUOUS" : "FAILED";
  const [updated] = await db.update(integrationActionRuns).set({ status, errorCode: input.errorCode, safeResponseMetadata: input.safeResponseMetadata ?? {}, leaseExpiresAt: null, completedAt: now, updatedAt: now }).where(and(eq(integrationActionRuns.id, input.actionId), eq(integrationActionRuns.workspaceId, input.workspaceId), eq(integrationActionRuns.status, "IN_FLIGHT"))).returning();
  if (updated) return updated;
  const existing = await getActionById(input.actionId, input.workspaceId, db);
  if (existing && existing.status === status) return existing;
  throw new AppError("INTEGRATION_ACTION_STATE_CONFLICT", 409, "The integration action state has already changed.");
}

export async function markStaleIntegrationActionAmbiguous(actionId: string, workspaceId: string, db: Database = getDatabase(), now = new Date()): Promise<boolean> {
  const [updated] = await db.update(integrationActionRuns).set({ status: "AMBIGUOUS", errorCode: "INTEGRATION_STALE_IN_FLIGHT", leaseExpiresAt: null, completedAt: now, updatedAt: now }).where(and(eq(integrationActionRuns.id, actionId), eq(integrationActionRuns.workspaceId, workspaceId), eq(integrationActionRuns.status, "IN_FLIGHT"), lt(integrationActionRuns.leaseExpiresAt, now))).returning();
  return Boolean(updated);
}

export { INTEGRATION_ACTION_STATUSES };

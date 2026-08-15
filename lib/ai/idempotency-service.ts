import { and, eq, lt } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { aiIdempotencyOperationKeyHash } from "@/lib/ai/idempotency";
import { getDatabase, type Database, aiGenerationIdempotency } from "@/lib/database";
import { encryptAiIdempotencyResponse, decryptAiIdempotencyResponse } from "@/lib/security/secrets";
import { parseSecretKeyring } from "@/lib/security/keyring";
import { admitAiGeneration } from "@/lib/usage/service";
import { directAiOperationKey } from "@/lib/usage/policy";
import { AIError, type AIErrorCode, GenerationFailedError, InvalidRequestError, ModelUnavailableError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/ai/errors";
import type { LLMResult } from "@/lib/ai/types";
import { AppError } from "@/lib/security/errors";
import { metrics } from "@/lib/observability/metrics";

export interface BeginAiIdempotencyInput {
  workspaceId: string;
  operationKey: string;
  requestFingerprint: string;
  mode: "SYNC" | "STREAM";
  correlationId?: string | null;
  now?: Date;
  db?: Database;
}

export type BeginAiIdempotencyResult =
  | { kind: "NEW"; recordId: string; operationKeyHash: string }
  | { kind: "REPLAY"; result: LLMResult }
  | { kind: "FAILED"; error: AIError }
  | { kind: "CONFLICT"; error: AppError };

function responseKeyring() {
  const env = getEnv();
  return { keyring: parseSecretKeyring(env.AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON), currentKeyVersion: env.AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION };
}

function conflict(code: string, message: string): BeginAiIdempotencyResult {
  return { kind: "CONFLICT", error: new AppError(code, 409, message) };
}

function replayFailure(code: string | null): AIError {
  switch (code as AIErrorCode) {
    case "PROVIDER_UNAVAILABLE": return new ProviderUnavailableError();
    case "MODEL_UNAVAILABLE": return new ModelUnavailableError();
    case "REQUEST_TIMEOUT": return new RequestTimeoutError();
    case "INVALID_REQUEST": return new InvalidRequestError();
    default: return new GenerationFailedError();
  }
}

function decryptReplay(record: typeof aiGenerationIdempotency.$inferSelect): LLMResult {
  if (!record.responseCiphertext || !record.responseKeyVersion) throw new Error("AI idempotency replay material is unavailable.");
  const { keyring, currentKeyVersion } = responseKeyring();
  const plaintext = decryptAiIdempotencyResponse(record.responseCiphertext, { keyring, currentKeyVersion, workspaceId: record.workspaceId, recordId: record.id });
  const result = JSON.parse(plaintext) as LLMResult;
  if (!result || typeof result.text !== "string" || typeof result.model !== "string" || typeof result.done !== "boolean" || typeof result.durationMs !== "number") throw new Error("AI idempotency replay material is invalid.");
  return result;
}

export async function beginAiIdempotency(input: BeginAiIdempotencyInput): Promise<BeginAiIdempotencyResult> {
  const db = input.db ?? getDatabase();
  const operationKeyHash = aiIdempotencyOperationKeyHash(input.operationKey);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + getEnv().AI_IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const inserted = await db.transaction(async (tx) => {
    const [record] = await tx.insert(aiGenerationIdempotency).values({
      workspaceId: input.workspaceId,
      operationKeyHash,
      requestFingerprint: input.requestFingerprint,
      mode: input.mode,
      status: "IN_PROGRESS",
      correlationId: input.correlationId ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: [aiGenerationIdempotency.workspaceId, aiGenerationIdempotency.operationKeyHash] }).returning({ id: aiGenerationIdempotency.id });
    if (!record) return undefined;
    await admitAiGeneration({
      workspaceId: input.workspaceId,
      operationKey: directAiOperationKey(operationKeyHash),
      sourceType: "DIRECT_AI",
      sourceId: record.id,
      correlationId: input.correlationId,
      now,
      db: tx as unknown as Database,
    });
    return record;
  });
  if (inserted) {
    metrics.increment("flowyn_ai_idempotency_total", { mode: input.mode, outcome: "new" });
    return { kind: "NEW", recordId: inserted.id, operationKeyHash };
  }

  const [existing] = await db.select().from(aiGenerationIdempotency).where(and(eq(aiGenerationIdempotency.workspaceId, input.workspaceId), eq(aiGenerationIdempotency.operationKeyHash, operationKeyHash))).limit(1);
  if (!existing) throw new AppError("AI_IDEMPOTENCY_UNAVAILABLE", 503, "AI idempotency state is temporarily unavailable.");
  if (existing.requestFingerprint !== input.requestFingerprint) return conflict("AI_IDEMPOTENCY_KEY_REUSED", "The idempotency key was reused for a different request.");
  if (existing.status === "IN_PROGRESS") {
    metrics.increment("flowyn_ai_idempotency_total", { mode: input.mode, outcome: "in_progress" });
    return conflict("AI_IDEMPOTENCY_IN_PROGRESS", "The idempotent AI request is already in progress.");
  }
  if (existing.status === "UNKNOWN") return conflict("AI_IDEMPOTENCY_UNKNOWN", "The idempotent AI request has an unknown provider outcome; use a new key.");
  if (existing.status === "STREAM_COMPLETED") return conflict("AI_STREAM_NOT_REPLAYABLE", "Completed streaming responses cannot be replayed; use a new key.");
  if (existing.status === "FAILED") return { kind: "FAILED", error: replayFailure(existing.errorCode) };
  try {
    return { kind: "REPLAY", result: decryptReplay(existing) };
  } catch {
    throw new AppError("AI_IDEMPOTENCY_REPLAY_UNAVAILABLE", 503, "The idempotent AI response is temporarily unavailable.");
  }
}

export function idempotentUsage(operationKeyHash: string, recordId: string, correlationId?: string | null) {
  return { operationKey: directAiOperationKey(operationKeyHash), sourceType: "DIRECT_AI", sourceId: recordId, correlationId };
}

export async function completeAiIdempotency(input: { workspaceId: string; recordId: string; result: LLMResult; db?: Database; now?: Date }): Promise<LLMResult> {
  const db = input.db ?? getDatabase();
  const env = getEnv();
  const result = { ...input.result, text: input.result.text.slice(0, env.AI_IDEMPOTENCY_RESPONSE_MAX_CHARS) };
  const { keyring, currentKeyVersion } = responseKeyring();
  const responseCiphertext = encryptAiIdempotencyResponse(JSON.stringify(result), { keyring, currentKeyVersion, workspaceId: input.workspaceId, recordId: input.recordId });
  const now = input.now ?? new Date();
  await db.update(aiGenerationIdempotency).set({ status: "SUCCEEDED", responseCiphertext, responseKeyVersion: currentKeyVersion, completedAt: now, updatedAt: now }).where(and(eq(aiGenerationIdempotency.id, input.recordId), eq(aiGenerationIdempotency.workspaceId, input.workspaceId), eq(aiGenerationIdempotency.status, "IN_PROGRESS")));
  return result;
}

export async function failAiIdempotency(input: { workspaceId: string; recordId: string; error: AIError; db?: Database; now?: Date }): Promise<void> {
  const db = input.db ?? getDatabase();
  const now = input.now ?? new Date();
  await db.update(aiGenerationIdempotency).set({ status: "FAILED", errorCode: input.error.code, completedAt: now, updatedAt: now }).where(and(eq(aiGenerationIdempotency.id, input.recordId), eq(aiGenerationIdempotency.workspaceId, input.workspaceId), eq(aiGenerationIdempotency.status, "IN_PROGRESS")));
}

export async function completeAiStreamIdempotency(input: { workspaceId: string; recordId: string; db?: Database; now?: Date }): Promise<void> {
  const db = input.db ?? getDatabase();
  const now = input.now ?? new Date();
  await db.update(aiGenerationIdempotency).set({ status: "STREAM_COMPLETED", completedAt: now, updatedAt: now }).where(and(eq(aiGenerationIdempotency.id, input.recordId), eq(aiGenerationIdempotency.workspaceId, input.workspaceId), eq(aiGenerationIdempotency.status, "IN_PROGRESS")));
}

export async function recoverStaleAiIdempotency(db: Database = getDatabase(), now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - getEnv().AI_IDEMPOTENCY_STALE_AFTER_SECONDS * 1000);
  const rows = await db.update(aiGenerationIdempotency).set({ status: "UNKNOWN", completedAt: now, updatedAt: now }).where(and(eq(aiGenerationIdempotency.status, "IN_PROGRESS"), lt(aiGenerationIdempotency.updatedAt, cutoff))).returning({ id: aiGenerationIdempotency.id });
  return rows.length;
}

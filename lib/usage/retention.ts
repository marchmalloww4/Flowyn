import { and, asc, inArray, isNotNull, lt, or } from "drizzle-orm";
import { getDatabase, type Database, aiGenerationIdempotency, generationLogs, workflowScheduleOccurrences, workspaceConcurrencyReservations, workspaceUsageAdmissions } from "@/lib/database";

export const DEFAULT_OPERATIONAL_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_BATCH = 100;
const MAX_CLEANUP_BATCH = 500;

export function getOperationalRetentionCutoff(now = new Date(), retentionDays = DEFAULT_OPERATIONAL_RETENTION_DAYS): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error("Operational retention is outside the supported range.");
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function normalizeRetentionCleanupBatch(batchSize: number | undefined): number {
  if (batchSize === undefined || !Number.isFinite(batchSize)) return DEFAULT_CLEANUP_BATCH;
  return Math.min(MAX_CLEANUP_BATCH, Math.max(1, Math.floor(batchSize)));
}

export interface RetentionCleanupResult {
  generationLogs: number;
  scheduleOccurrences: number;
  usageAdmissions: number;
  concurrencyReservations: number;
  aiIdempotency: number;
  total: number;
}

export interface RetentionCleanupOptions {
  db?: Database;
  now?: Date;
  batchSize?: number;
}

async function purgeGenerationLogs(db: Database, cutoff: Date, batchSize: number): Promise<number> {
  const rows = await db.select({ id: generationLogs.id }).from(generationLogs).where(lt(generationLogs.createdAt, cutoff)).orderBy(asc(generationLogs.createdAt)).limit(batchSize);
  if (rows.length === 0) return 0;
  await db.delete(generationLogs).where(inArray(generationLogs.id, rows.map((row) => row.id)));
  return rows.length;
}

async function purgeScheduleOccurrences(db: Database, cutoff: Date, batchSize: number): Promise<number> {
  const rows = await db.select({ id: workflowScheduleOccurrences.id }).from(workflowScheduleOccurrences).where(lt(workflowScheduleOccurrences.createdAt, cutoff)).orderBy(asc(workflowScheduleOccurrences.createdAt)).limit(batchSize);
  if (rows.length === 0) return 0;
  await db.delete(workflowScheduleOccurrences).where(inArray(workflowScheduleOccurrences.id, rows.map((row) => row.id)));
  return rows.length;
}

async function purgeUsageAdmissions(db: Database, cutoff: Date, batchSize: number): Promise<number> {
  const rows = await db.select({ id: workspaceUsageAdmissions.id }).from(workspaceUsageAdmissions).where(lt(workspaceUsageAdmissions.createdAt, cutoff)).orderBy(asc(workspaceUsageAdmissions.createdAt)).limit(batchSize);
  if (rows.length === 0) return 0;
  await db.delete(workspaceUsageAdmissions).where(inArray(workspaceUsageAdmissions.id, rows.map((row) => row.id)));
  return rows.length;
}

async function purgeExpiredReservations(db: Database, cutoff: Date, now: Date, batchSize: number): Promise<number> {
  const rows = await db.select({ id: workspaceConcurrencyReservations.id })
    .from(workspaceConcurrencyReservations)
    .where(and(lt(workspaceConcurrencyReservations.createdAt, cutoff), or(isNotNull(workspaceConcurrencyReservations.releasedAt), lt(workspaceConcurrencyReservations.expiresAt, now))))
    .orderBy(asc(workspaceConcurrencyReservations.createdAt))
    .limit(batchSize);
  if (rows.length === 0) return 0;
  await db.delete(workspaceConcurrencyReservations).where(inArray(workspaceConcurrencyReservations.id, rows.map((row) => row.id)));
  return rows.length;
}

async function purgeAiIdempotency(db: Database, cutoff: Date, batchSize: number): Promise<number> {
  const rows = await db.select({ id: aiGenerationIdempotency.id }).from(aiGenerationIdempotency).where(and(
    lt(aiGenerationIdempotency.createdAt, cutoff),
    inArray(aiGenerationIdempotency.status, ["SUCCEEDED", "FAILED", "UNKNOWN", "STREAM_COMPLETED"]),
  )).orderBy(asc(aiGenerationIdempotency.createdAt)).limit(batchSize);
  if (rows.length === 0) return 0;
  await db.delete(aiGenerationIdempotency).where(inArray(aiGenerationIdempotency.id, rows.map((row) => row.id)));
  return rows.length;
}

export async function cleanupOperationalRetention(options: RetentionCleanupOptions = {}): Promise<RetentionCleanupResult> {
  const db = options.db ?? getDatabase();
  const now = options.now ?? new Date();
  const cutoff = getOperationalRetentionCutoff(now);
  const batchSize = normalizeRetentionCleanupBatch(options.batchSize);
  const generationLogsCount = await purgeGenerationLogs(db, cutoff, batchSize);
  const scheduleOccurrencesCount = await purgeScheduleOccurrences(db, cutoff, batchSize);
  const usageAdmissionsCount = await purgeUsageAdmissions(db, cutoff, batchSize);
  const concurrencyReservationsCount = await purgeExpiredReservations(db, cutoff, now, batchSize);
  const aiIdempotencyCount = await purgeAiIdempotency(db, getOperationalRetentionCutoff(now, 7), batchSize);
  return {
    generationLogs: generationLogsCount,
    scheduleOccurrences: scheduleOccurrencesCount,
    usageAdmissions: usageAdmissionsCount,
    concurrencyReservations: concurrencyReservationsCount,
    aiIdempotency: aiIdempotencyCount,
    total: generationLogsCount + scheduleOccurrencesCount + usageAdmissionsCount + concurrencyReservationsCount + aiIdempotencyCount,
  };
}

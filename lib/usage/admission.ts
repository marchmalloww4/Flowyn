import { and, eq, sql } from "drizzle-orm";
import { getDatabase, type Database, workspaceUsageAdmissions, workspaceUsageBuckets, type WorkspaceUsageMetric } from "@/lib/database";
import { AppError } from "@/lib/security/errors";

export interface WorkspaceUsageAdmissionInput {
  workspaceId: string;
  metric: WorkspaceUsageMetric;
  operationKey: string;
  sourceType: string;
  sourceId?: string | null;
  bucketStart: Date;
  limit: number;
  units?: number;
  now?: Date;
  db?: Database;
}

export interface WorkspaceUsageAdmissionResult {
  admitted: true;
  duplicate: boolean;
  admissionId?: string;
  consumed?: number;
  limit: number;
}

export function minuteBucketStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

export function dayBucketStart(now: Date): Date {
  const value = new Date(now);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function validateInput(input: WorkspaceUsageAdmissionInput, units: number): void {
  if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("Workspace usage limit must be a positive integer.");
  if (!Number.isInteger(units) || units < 1) throw new Error("Workspace usage units must be a positive integer.");
  if (!input.operationKey || input.operationKey.length > 240) throw new Error("Workspace usage operation key is outside the supported bounds.");
  if (!input.sourceType || input.sourceType.length > 64) throw new Error("Workspace usage source type is outside the supported bounds.");
}

export async function admitWorkspaceUsage(input: WorkspaceUsageAdmissionInput): Promise<WorkspaceUsageAdmissionResult>;
export async function admitWorkspaceUsage(input: WorkspaceUsageAdmissionInput, db: Database): Promise<WorkspaceUsageAdmissionResult>;
export async function admitWorkspaceUsage(input: WorkspaceUsageAdmissionInput, db = input.db ?? getDatabase()): Promise<WorkspaceUsageAdmissionResult> {
  const now = input.now ?? new Date();
  const units = input.units ?? 1;
  validateInput(input, units);

  return db.transaction(async (tx) => {
    const [inserted] = await tx.insert(workspaceUsageAdmissions).values({
      workspaceId: input.workspaceId,
      metric: input.metric,
      operationKey: input.operationKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      bucketStart: input.bucketStart,
      units,
      createdAt: now,
    }).onConflictDoNothing({ target: [workspaceUsageAdmissions.workspaceId, workspaceUsageAdmissions.metric, workspaceUsageAdmissions.operationKey] }).returning({ id: workspaceUsageAdmissions.id });

    if (!inserted) {
      const [existing] = await tx.select({ id: workspaceUsageAdmissions.id }).from(workspaceUsageAdmissions).where(and(
        eq(workspaceUsageAdmissions.workspaceId, input.workspaceId),
        eq(workspaceUsageAdmissions.metric, input.metric),
        eq(workspaceUsageAdmissions.operationKey, input.operationKey),
      )).limit(1);
      if (!existing) throw new AppError("WORKSPACE_USAGE_ADMISSION_UNAVAILABLE", 503, "Workspace usage admission is temporarily unavailable.");
      return { admitted: true, duplicate: true, limit: input.limit };
    }

    const [bucket] = await tx.insert(workspaceUsageBuckets).values({
      workspaceId: input.workspaceId,
      metric: input.metric,
      bucketStart: input.bucketStart,
      consumed: units,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [workspaceUsageBuckets.workspaceId, workspaceUsageBuckets.metric, workspaceUsageBuckets.bucketStart],
      set: {
        consumed: sql`${workspaceUsageBuckets.consumed} + ${units}`,
        updatedAt: now,
      },
    }).returning({ consumed: workspaceUsageBuckets.consumed });

    if (!bucket) throw new AppError("WORKSPACE_USAGE_ADMISSION_UNAVAILABLE", 503, "Workspace usage admission is temporarily unavailable.");
    if (bucket.consumed > input.limit) throw new AppError("WORKSPACE_QUOTA_EXCEEDED", 429, "Workspace usage quota exceeded.");
    return { admitted: true, duplicate: false, admissionId: inserted.id, consumed: bucket.consumed, limit: input.limit };
  });
}

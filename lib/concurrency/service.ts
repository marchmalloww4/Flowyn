import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDatabase, type Database, workspaceConcurrencyReservations, workspaceConcurrencyStates, type WorkspaceConcurrencyOperation } from "@/lib/database";
import { AppError } from "@/lib/security/errors";

export interface ReservationInput {
  workspaceId: string;
  operationClass: WorkspaceConcurrencyOperation;
  sourceId: string;
  ownerId: string;
  limit: number;
  leaseMs: number;
  now?: Date;
  db?: Database;
}

export interface ReservationResult {
  acquired: boolean;
  duplicate: boolean;
  reservation?: typeof workspaceConcurrencyReservations.$inferSelect;
}

export function reservationExpiry(now: Date, leaseMs: number): Date {
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3_600_000) throw new Error("Concurrency lease duration is outside the supported range.");
  return new Date(now.getTime() + leaseMs);
}

export function isReservationActive(reservation: { expiresAt: Date; releasedAt: Date | null }, now: Date): boolean {
  return reservation.releasedAt === null && reservation.expiresAt > now;
}

export function canAcquireReservation(input: { activeCount: number; expiredCount: number; limit: number }): boolean {
  if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("Concurrency limit must be a positive integer.");
  return Math.max(0, input.activeCount - input.expiredCount) < input.limit;
}

function assertInput(input: ReservationInput): void {
  if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("Concurrency limit must be a positive integer.");
  if (!input.sourceId || input.sourceId.length > 160) throw new Error("Concurrency source ID is outside the supported bounds.");
  if (!input.ownerId || input.ownerId.length > 160) throw new Error("Concurrency owner ID is outside the supported bounds.");
}

export async function acquireWorkspaceReservation(input: ReservationInput, db: Database = input.db ?? getDatabase()): Promise<ReservationResult> {
  assertInput(input);
  const now = input.now ?? new Date();
  const expiresAt = reservationExpiry(now, input.leaseMs);

  return db.transaction(async (tx) => {
    await tx.insert(workspaceConcurrencyStates).values({
      workspaceId: input.workspaceId,
      operationClass: input.operationClass,
      activeCount: 0,
      updatedAt: now,
    }).onConflictDoNothing({ target: [workspaceConcurrencyStates.workspaceId, workspaceConcurrencyStates.operationClass] });

    const [state] = await tx.select().from(workspaceConcurrencyStates).where(and(
      eq(workspaceConcurrencyStates.workspaceId, input.workspaceId),
      eq(workspaceConcurrencyStates.operationClass, input.operationClass),
    )).for("update").limit(1);
    if (!state) throw new AppError("WORKSPACE_CONCURRENCY_UNAVAILABLE", 503, "Workspace concurrency state is temporarily unavailable.");

    const expired = await tx.update(workspaceConcurrencyReservations).set({ releasedAt: now }).where(and(
      eq(workspaceConcurrencyReservations.workspaceId, input.workspaceId),
      eq(workspaceConcurrencyReservations.operationClass, input.operationClass),
      isNull(workspaceConcurrencyReservations.releasedAt),
      lte(workspaceConcurrencyReservations.expiresAt, now),
    )).returning({ id: workspaceConcurrencyReservations.id });
    const activeCount = Math.max(0, state.activeCount - expired.length);

    const [existing] = await tx.select().from(workspaceConcurrencyReservations).where(and(
      eq(workspaceConcurrencyReservations.workspaceId, input.workspaceId),
      eq(workspaceConcurrencyReservations.operationClass, input.operationClass),
      eq(workspaceConcurrencyReservations.sourceId, input.sourceId),
      isNull(workspaceConcurrencyReservations.releasedAt),
    )).limit(1);
    if (existing && isReservationActive(existing, now)) return { acquired: true, duplicate: true, reservation: existing };

    if (!canAcquireReservation({ activeCount, expiredCount: 0, limit: input.limit })) {
      if (activeCount !== state.activeCount) {
        await tx.update(workspaceConcurrencyStates).set({ activeCount, updatedAt: now }).where(eq(workspaceConcurrencyStates.id, state.id));
      }
      return { acquired: false, duplicate: false };
    }

    const [reservation] = await tx.insert(workspaceConcurrencyReservations).values({
      workspaceId: input.workspaceId,
      operationClass: input.operationClass,
      sourceId: input.sourceId,
      ownerId: input.ownerId,
      expiresAt,
      createdAt: now,
      releasedAt: null,
    }).returning();
    if (!reservation) throw new AppError("WORKSPACE_CONCURRENCY_UNAVAILABLE", 503, "Workspace concurrency reservation is temporarily unavailable.");
    await tx.update(workspaceConcurrencyStates).set({ activeCount: activeCount + 1, updatedAt: now }).where(eq(workspaceConcurrencyStates.id, state.id));
    return { acquired: true, duplicate: false, reservation };
  });
}

export async function renewWorkspaceReservation(input: { reservationId: string; workspaceId: string; ownerId: string; leaseMs: number; now?: Date }, db: Database = getDatabase()): Promise<boolean> {
  const now = input.now ?? new Date();
  const expiresAt = reservationExpiry(now, input.leaseMs);
  const [renewed] = await db.update(workspaceConcurrencyReservations).set({ expiresAt }).where(and(
    eq(workspaceConcurrencyReservations.id, input.reservationId),
    eq(workspaceConcurrencyReservations.workspaceId, input.workspaceId),
    eq(workspaceConcurrencyReservations.ownerId, input.ownerId),
    isNull(workspaceConcurrencyReservations.releasedAt),
    gte(workspaceConcurrencyReservations.expiresAt, now),
  )).returning({ id: workspaceConcurrencyReservations.id });
  return Boolean(renewed);
}

export async function transferWorkspaceReservation(input: { reservationId: string; workspaceId: string; fromOwnerId: string; toOwnerId: string; leaseMs: number; now?: Date }, db: Database = getDatabase()): Promise<boolean> {
  const now = input.now ?? new Date();
  const expiresAt = reservationExpiry(now, input.leaseMs);
  const [transferred] = await db.update(workspaceConcurrencyReservations).set({ ownerId: input.toOwnerId, expiresAt }).where(and(
    eq(workspaceConcurrencyReservations.id, input.reservationId),
    eq(workspaceConcurrencyReservations.workspaceId, input.workspaceId),
    eq(workspaceConcurrencyReservations.ownerId, input.fromOwnerId),
    isNull(workspaceConcurrencyReservations.releasedAt),
    gte(workspaceConcurrencyReservations.expiresAt, now),
  )).returning({ id: workspaceConcurrencyReservations.id });
  return Boolean(transferred);
}

export async function releaseWorkspaceReservation(input: { reservationId: string; workspaceId: string; ownerId: string; now?: Date }, db: Database = getDatabase()): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [released] = await tx.update(workspaceConcurrencyReservations).set({ releasedAt: now }).where(and(
      eq(workspaceConcurrencyReservations.id, input.reservationId),
      eq(workspaceConcurrencyReservations.workspaceId, input.workspaceId),
      eq(workspaceConcurrencyReservations.ownerId, input.ownerId),
      isNull(workspaceConcurrencyReservations.releasedAt),
    )).returning({ id: workspaceConcurrencyReservations.id, operationClass: workspaceConcurrencyReservations.operationClass });
    if (!released) return false;
    const [state] = await tx.select().from(workspaceConcurrencyStates).where(and(
      eq(workspaceConcurrencyStates.workspaceId, input.workspaceId),
      eq(workspaceConcurrencyStates.operationClass, released.operationClass),
    )).for("update").limit(1);
    if (state) await tx.update(workspaceConcurrencyStates).set({ activeCount: sql`greatest(${workspaceConcurrencyStates.activeCount} - 1, 0)`, updatedAt: now }).where(eq(workspaceConcurrencyStates.id, state.id));
    return true;
  });
}

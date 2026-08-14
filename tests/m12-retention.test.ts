import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATIONAL_RETENTION_DAYS, getOperationalRetentionCutoff, normalizeRetentionCleanupBatch, cleanupOperationalRetention } from "@/lib/usage/retention";

function database(rows: Array<{ id: string }>) {
  const deleted: string[] = [];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({ limit: vi.fn(async () => rows) })),
      })),
    })),
  }));
  const remove = vi.fn(() => ({ where: vi.fn(async () => { deleted.push(...rows.map((row) => row.id)); }) }));
  return { db: { select, delete: remove } as never, deleted, select, remove };
}

describe("Milestone 12 bounded retention", () => {
  it("uses the fixed operational retention class and bounded batches", () => {
    const now = new Date("2026-08-15T00:00:00.000Z");
    expect(DEFAULT_OPERATIONAL_RETENTION_DAYS).toBe(30);
    expect(getOperationalRetentionCutoff(now).toISOString()).toBe("2026-07-16T00:00:00.000Z");
    expect(normalizeRetentionCleanupBatch(undefined)).toBe(100);
    expect(normalizeRetentionCleanupBatch(9999)).toBe(500);
    expect(normalizeRetentionCleanupBatch(0)).toBe(1);
  });

  it("deletes at most one bounded batch from approved operational tables", async () => {
    const fixture = database([{ id: "old-1" }, { id: "old-2" }]);
    const result = await cleanupOperationalRetention({ db: fixture.db, now: new Date("2026-08-15T00:00:00.000Z"), batchSize: 2 });
    expect(result.generationLogs).toBe(2);
    expect(result.scheduleOccurrences).toBe(2);
    expect(result.usageAdmissions).toBe(2);
    expect(result.concurrencyReservations).toBe(2);
    expect(fixture.remove).toHaveBeenCalledTimes(4);
    expect(fixture.deleted).toHaveLength(8);
  });
});

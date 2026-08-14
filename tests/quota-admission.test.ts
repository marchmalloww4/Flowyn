import { describe, expect, it, vi } from "vitest";
import { admitWorkspaceUsage, dayBucketStart, minuteBucketStart } from "@/lib/usage/admission";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function fakeDatabase(options: { inserted?: unknown[]; existing?: unknown[]; bucket?: unknown[] }) {
  const inserted = [...(options.inserted ?? [])];
  const existing = [...(options.existing ?? [])];
  const bucket = [...(options.bucket ?? [])];
  const tx = {
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(inserted) }),
        onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(bucket) }),
      }),
    })),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(existing) }),
      }),
    }),
  };
  return { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

describe("durable workspace quota admission", () => {
  it("admits a new operation and returns its durable bucket state", async () => {
    const db = fakeDatabase({ inserted: [{ id: "admission-1" }], bucket: [{ consumed: 1 }] });

    await expect(admitWorkspaceUsage({
      workspaceId,
      metric: "AI_GENERATION_DAY",
      operationKey: "direct-ai:request-1",
      sourceType: "DIRECT_AI",
      sourceId: "request-1",
      bucketStart: dayBucketStart(new Date("2026-08-15T12:00:00Z")),
      limit: 500,
      db: db as never,
    })).resolves.toMatchObject({ admitted: true, duplicate: false, consumed: 1, limit: 500 });
  });

  it("allows the exact quota boundary and rejects the next unit", async () => {
    const allowedDb = fakeDatabase({ inserted: [{ id: "admission-1" }], bucket: [{ consumed: 500 }] });
    await expect(admitWorkspaceUsage({
      workspaceId,
      metric: "AI_GENERATION_DAY",
      operationKey: "direct-ai:request-1",
      sourceType: "DIRECT_AI",
      bucketStart: dayBucketStart(new Date("2026-08-15T12:00:00Z")),
      limit: 500,
      db: allowedDb as never,
    })).resolves.toMatchObject({ admitted: true, consumed: 500 });

    const rejectedDb = fakeDatabase({ inserted: [{ id: "admission-2" }], bucket: [{ consumed: 501 }] });
    await expect(admitWorkspaceUsage({
      workspaceId,
      metric: "AI_GENERATION_DAY",
      operationKey: "direct-ai:request-2",
      sourceType: "DIRECT_AI",
      bucketStart: dayBucketStart(new Date("2026-08-15T12:00:00Z")),
      limit: 500,
      db: rejectedDb as never,
    })).rejects.toMatchObject({ code: "WORKSPACE_QUOTA_EXCEEDED", status: 429 });
  });

  it("returns an idempotent duplicate without incrementing the bucket", async () => {
    const db = fakeDatabase({ existing: [{ id: "admission-1", units: 1 }], bucket: [] });

    await expect(admitWorkspaceUsage({
      workspaceId,
      metric: "WORKFLOW_START_DAY",
      operationKey: "workflow-start:run-1",
      sourceType: "WORKFLOW_RUN",
      sourceId: "run-1",
      bucketStart: dayBucketStart(new Date("2026-08-15T12:00:00Z")),
      limit: 1000,
      db: db as never,
    })).resolves.toMatchObject({ admitted: true, duplicate: true, limit: 1000 });
    expect(db.tx.insert).toHaveBeenCalledTimes(1);
  });
});

describe("usage bucket helpers", () => {
  it("normalizes UTC minute and day boundaries", () => {
    const now = new Date("2026-08-15T12:34:56.789Z");
    expect(minuteBucketStart(now).toISOString()).toBe("2026-08-15T12:34:00.000Z");
    expect(dayBucketStart(now).toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });
});

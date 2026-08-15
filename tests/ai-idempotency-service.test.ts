import { beforeEach, describe, expect, it, vi } from "vitest";

const admission = vi.hoisted(() => ({ admitAiGeneration: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/usage/service", () => admission);

import { beginAiIdempotency, completeAiIdempotency } from "@/lib/ai/idempotency-service";

const baseRecord = {
  id: "record-1",
  workspaceId: "workspace-a",
  operationKeyHash: "",
  requestFingerprint: "fingerprint-a",
  mode: "SYNC" as const,
  status: "IN_PROGRESS" as const,
  responseCiphertext: null,
  responseKeyVersion: null,
  errorCode: null,
  correlationId: "correlation-a",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  expiresAt: new Date("2026-01-08T00:00:00.000Z"),
};

function fakeDatabase(record = { ...baseRecord }) {
  let insertAvailable = true;
  const tx = {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (!insertAvailable) return [];
            insertAvailable = false;
            return [{ id: record.id }];
          },
        }),
      }),
    }),
  };
  return {
    transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [record] }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          Object.assign(record, values);
          return [];
        },
      }),
    }),
  } as never;
}

describe("durable direct AI idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admits quota once when the workspace-scoped key is first inserted", async () => {
    const db = fakeDatabase();
    const first = await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-a", mode: "SYNC", db });
    expect(first.kind).toBe("NEW");
    expect(admission.admitAiGeneration).toHaveBeenCalledOnce();

    const duplicate = await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-a", mode: "SYNC", db });
    expect(duplicate).toMatchObject({ kind: "CONFLICT", error: { code: "AI_IDEMPOTENCY_IN_PROGRESS" } });
    expect(admission.admitAiGeneration).toHaveBeenCalledOnce();
  });

  it("rejects the same key when its request fingerprint changes", async () => {
    const db = fakeDatabase();
    await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-a", mode: "SYNC", db });
    const reused = await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-b", mode: "SYNC", db });
    expect(reused).toMatchObject({ kind: "CONFLICT", error: { code: "AI_IDEMPOTENCY_KEY_REUSED" } });
  });

  it("encrypts a bounded result and replays it without another admission", async () => {
    const db = fakeDatabase();
    const first = await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-a", mode: "SYNC", db });
    if (first.kind !== "NEW") throw new Error("expected new idempotency record");
    const result = await completeAiIdempotency({ workspaceId: "workspace-a", recordId: first.recordId, result: { text: "hello", model: "test", done: true, durationMs: 2 }, db });
    expect(result.text).toBe("hello");
    const replay = await beginAiIdempotency({ workspaceId: "workspace-a", operationKey: "request-a", requestFingerprint: "fingerprint-a", mode: "SYNC", db });
    expect(replay).toMatchObject({ kind: "REPLAY", result: { text: "hello", model: "test" } });
    expect(admission.admitAiGeneration).toHaveBeenCalledOnce();
  });
});

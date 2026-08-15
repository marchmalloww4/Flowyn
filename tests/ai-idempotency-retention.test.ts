import { describe, expect, it, vi } from "vitest";
import { recoverStaleAiIdempotency } from "@/lib/ai/idempotency-service";

describe("AI idempotency recovery", () => {
  it("marks only stale in-progress records unknown", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "record-1" }]);
    const db = {
      update: () => ({
        set: () => ({
          where: () => ({ returning }),
        }),
      }),
    } as never;

    await expect(recoverStaleAiIdempotency(db, new Date("2026-08-15T00:00:00.000Z"))).resolves.toBe(1);
    expect(returning).toHaveBeenCalledOnce();
  });
});

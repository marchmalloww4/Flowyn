import { describe, expect, it, vi } from "vitest";
import { cleanupOperationalRetention } from "@/lib/usage/retention";

describe("Milestone 12 retention recovery", () => {
  it("can be rerun after an interrupted delete without widening the cleanup scope", async () => {
    let deleteAttempts = 0;
    const db = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ id: "old-1" }] }) }) }) }),
      delete: () => ({ where: vi.fn(async () => { deleteAttempts += 1; if (deleteAttempts === 1) throw new Error("temporary database error"); }) }),
    } as never;

    await expect(cleanupOperationalRetention({ db, batchSize: 1 })).rejects.toThrow("temporary database error");
    await expect(cleanupOperationalRetention({ db, batchSize: 1 })).resolves.toMatchObject({ generationLogs: 1 });
    expect(deleteAttempts).toBeGreaterThan(1);
  });
});

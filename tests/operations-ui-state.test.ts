import { describe, expect, it } from "vitest";
import { operationStatusSummary } from "@/lib/client/operations-state";

describe("operations presentation state", () => {
  it("summarizes durable status counters without raw payloads", () => {
    expect(operationStatusSummary({ COMPLETED: 2, FAILED: 1 })).toBe("COMPLETED: 2 · FAILED: 1");
    expect(operationStatusSummary({})).toBe("None");
  });
});

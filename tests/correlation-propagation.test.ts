import { describe, expect, it } from "vitest";
import { getOrCreateCorrelationId, runWithCorrelationId, getCorrelationId } from "@/lib/observability/correlation";

describe("correlation IDs", () => {
  it("accepts a bounded request ID", () => {
    expect(getOrCreateCorrelationId(new Headers({ "x-request-id": "req-123" }))).toBe("req-123");
  });

  it("replaces invalid request IDs with a generated UUID", () => {
    const id = getOrCreateCorrelationId(new Headers({ "x-request-id": "contains whitespace" }));
    expect(id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("propagates the ID through an explicit execution context", async () => {
    await runWithCorrelationId("req-456", async () => {
      expect(getCorrelationId()).toBe("req-456");
    });
    expect(getCorrelationId()).toBeNull();
  });
});

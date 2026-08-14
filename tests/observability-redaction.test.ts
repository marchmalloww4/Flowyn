import { describe, expect, it } from "vitest";
import { redactLogValue, safeErrorSummary } from "@/lib/observability/redaction";

describe("observability redaction", () => {
  it("removes sensitive fields and bounds nested operational data", () => {
    const value = redactLogValue({
      credential: "secret-value",
      prompt: "private prompt",
      nested: { authorization: "Bearer token", safe: "ok" },
      safe: "value",
    });

    expect(value).toEqual({ safe: "value", nested: { safe: "ok" } });
  });

  it("summarizes unknown errors without retaining raw messages", () => {
    const summary = safeErrorSummary(new Error("Authorization: Bearer secret-value"));
    expect(summary).toEqual({ name: "Error" });
  });
});

import { describe, expect, it } from "vitest";
import { AppError, getFailureCategory } from "@/lib/security/errors";

describe("Milestone 12 failure categories", () => {
  it("classifies operational failures without exposing extra response data", () => {
    expect(getFailureCategory(new AppError("WORKSPACE_QUOTA_EXCEEDED", 429, "quota"))).toBe("QUOTA");
    expect(getFailureCategory(new AppError("WORKSPACE_RATE_LIMIT_EXCEEDED", 429, "rate"))).toBe("RATE_LIMIT");
    expect(getFailureCategory(new AppError("WORKSPACE_CONCURRENCY_LIMIT", 429, "concurrency"))).toBe("CONCURRENCY");
    expect(getFailureCategory(new AppError("INTEGRATION_AMBIGUOUS", 502, "ambiguous"))).toBe("AMBIGUOUS_EXTERNAL_SIDE_EFFECT");
    expect(getFailureCategory(new AppError("INTERNAL_ERROR", 500, "internal"))).toBe("INTERNAL");
  });
});

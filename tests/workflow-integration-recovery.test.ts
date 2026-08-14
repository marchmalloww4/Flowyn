import { describe, expect, it } from "vitest";
import { classifyWorkflowError } from "@/lib/workflows/errors";

describe("integration workflow recovery semantics", () => {
  it("does not classify an ambiguous action as retryable", () => {
    expect(classifyWorkflowError(new Error("INTEGRATION_PROVIDER_AMBIGUOUS"))).toMatchObject({ retryable: false });
  });
});

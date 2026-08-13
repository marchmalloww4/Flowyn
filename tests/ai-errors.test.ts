import { describe, expect, it } from "vitest";
import { AIError, InvalidStructuredOutputError, ModelUnavailableError, RequestTimeoutError } from "@/lib/ai/errors";

describe("AI errors", () => {
  it("exposes stable safe codes and messages", () => {
    const errors = [new ModelUnavailableError(), new RequestTimeoutError(), new InvalidStructuredOutputError()];
    expect(errors.map((error) => error.code)).toEqual(["MODEL_UNAVAILABLE", "REQUEST_TIMEOUT", "INVALID_STRUCTURED_OUTPUT"]);
    expect(errors.every((error) => error instanceof AIError)).toBe(true);
    expect(JSON.stringify(errors)).not.toContain("http");
  });
});

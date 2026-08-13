import { describe, expect, it } from "vitest";
import { DimensionMismatchError, MalformedResponseError, ModelUnavailableError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/embeddings/errors";
import { toErrorResponse } from "@/lib/security/errors";

describe("embedding error HTTP mapping", () => {
  it.each([
    [new ProviderUnavailableError(), 503, "PROVIDER_UNAVAILABLE"],
    [new RequestTimeoutError(), 503, "REQUEST_TIMEOUT"],
    [new ModelUnavailableError("secret-model-name"), 503, "MODEL_UNAVAILABLE"],
    [new MalformedResponseError(), 502, "MALFORMED_RESPONSE"],
    [new DimensionMismatchError(768, 1536), 502, "DIMENSION_MISMATCH"],
  ] as const)("maps %s to a safe %s response", (error, status, code) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.message).not.toContain("secret-model-name");
    expect(response.body.error.message).not.toContain("1536");
  });
});

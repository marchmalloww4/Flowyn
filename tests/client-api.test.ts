import { describe, expect, it, vi } from "vitest";
import { apiRequest, mapApiError } from "@/lib/client/api";

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("browser API error mapping", () => {
  it("preserves validation fields and returns safe validation copy", () => {
    const body = { error: { code: "VALIDATION_ERROR", message: "unsafe server detail", fields: { email: ["Invalid email"] } } };
    const error = mapApiError(response(400, body), body);

    expect(error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Check the highlighted fields.",
      fields: { email: ["Invalid email"] },
      correlationId: null,
      retryable: false,
    });
  });

  it("maps workflow version conflicts without retrying or discarding edits", () => {
    const body = { error: { code: "WORKFLOW_VERSION_CONFLICT", message: "server detail" } };
    const error = mapApiError(response(409, body), body);

    expect(error.code).toBe("WORKFLOW_VERSION_CONFLICT");
    expect(error.message).toBe("This workflow changed elsewhere. Reload the latest version before saving again.");
    expect(error.retryable).toBe(false);
  });

  it("redacts unknown server failures while preserving correlation IDs", () => {
    const body = { error: { code: "INTERNAL_ERROR", message: "database password=secret" } };
    const error = mapApiError(response(500, body, { "x-flowyn-correlation-id": "corr-123" }), body);

    expect(error.message).toBe("Something went wrong. Try again or contact your workspace administrator.");
    expect(error.message).not.toContain("database");
    expect(error.correlationId).toBe("corr-123");
    expect(error.retryable).toBe(false);
  });

  it("makes ambiguous integration outcomes terminal and non-retryable", () => {
    const body = { error: { code: "INTEGRATION_ACTION_AMBIGUOUS" } };
    const error = mapApiError(response(502, body), body);

    expect(error.message).toBe("The external action outcome is unknown. Do not retry automatically.");
    expect(error.retryable).toBe(false);
  });

  it("throws the mapped error for non-success responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(403, { error: { code: "WORKSPACE_FORBIDDEN" } })));

    await expect(apiRequest("/api/protected")).rejects.toMatchObject({
      name: "FlowynClientError",
      details: { code: "WORKSPACE_FORBIDDEN", message: "You do not have access to this workspace." },
    });

    vi.unstubAllGlobals();
  });
});

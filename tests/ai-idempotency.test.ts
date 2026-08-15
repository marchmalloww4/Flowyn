import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { encryptAiIdempotencyResponse, decryptAiIdempotencyResponse } from "@/lib/security/secrets";
import { aiIdempotencyOperationKeyHash, aiIdempotencyRequestFingerprint } from "@/lib/ai/idempotency";

const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

describe("direct AI idempotency primitives", () => {
  it("hashes operation keys without persisting the client key", () => {
    expect(aiIdempotencyOperationKeyHash("request-1")).toBe(createHash("sha256").update("request-1").digest("hex"));
    expect(aiIdempotencyOperationKeyHash("request-1")).not.toBe(aiIdempotencyOperationKeyHash("request-2"));
  });

  it("creates an order-stable request fingerprint", () => {
    const input = { workspaceId: "workspace-a", prompt: "hello", stream: false, temperature: 0.4 };
    expect(aiIdempotencyRequestFingerprint(input)).toBe(aiIdempotencyRequestFingerprint({ temperature: 0.4, stream: false, prompt: "hello", workspaceId: "workspace-a" }));
  });

  it("encrypts replay material with a purpose-specific authenticated envelope", () => {
    const context = { keyring: new Map([["v1", key]]), currentKeyVersion: "v1", workspaceId: "workspace-a", recordId: "record-1" };
    const envelope = encryptAiIdempotencyResponse(JSON.stringify({ text: "safe result" }), context);
    expect(envelope).toMatch(/^flowyn-ai-idempotency-response-v1\.v1\./u);
    expect(decryptAiIdempotencyResponse(envelope, context)).toBe(JSON.stringify({ text: "safe result" }));
    expect(() => decryptAiIdempotencyResponse(`${envelope}tampered`, context)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret } from "@/lib/security/secrets";

describe("webhook secret protection", () => {
  it("round trips with trigger-bound authenticated encryption", () => {
    const secret = generateWebhookSecret();
    const envelope = encryptWebhookSecret(secret, {
      encryptionKey: Buffer.alloc(32, 7),
      keyVersion: "v1",
      triggerId: "550e8400-e29b-41d4-a716-446655440000",
      secretVersion: 1,
    });

    expect(decryptWebhookSecret(envelope, {
      encryptionKey: Buffer.alloc(32, 7),
      keyVersion: "v1",
      triggerId: "550e8400-e29b-41d4-a716-446655440000",
      secretVersion: 1,
    })).toBe(secret);
    expect(() => decryptWebhookSecret(envelope, {
      encryptionKey: Buffer.alloc(32, 7),
      keyVersion: "v1",
      triggerId: "550e8400-e29b-41d4-a716-446655440001",
      secretVersion: 1,
    })).toThrow();
  });

  it("rejects an invalid encryption key length", () => {
    expect(() => encryptWebhookSecret("secret", {
      encryptionKey: Buffer.alloc(16),
      keyVersion: "v1",
      triggerId: "550e8400-e29b-41d4-a716-446655440000",
      secretVersion: 1,
    })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/security/secrets";
import { parseSecretKeyring } from "@/lib/security/keyring";

const context = {
  keyring: new Map([
    ["v1", Buffer.alloc(32, 1)],
    ["v0", Buffer.alloc(32, 2)],
  ]),
  currentKeyVersion: "v1",
  connectorId: "slack" as const,
  credentialId: "550e8400-e29b-41d4-a716-446655440000",
  secretVersion: 1,
};

describe("integration credential SecretBox", () => {
  it("round trips with the current key and binds the credential context", () => {
    const envelope = encryptIntegrationSecret(JSON.stringify({ apiToken: "xoxb-secret" }), context);
    expect(decryptIntegrationSecret(envelope, context)).toBe(JSON.stringify({ apiToken: "xoxb-secret" }));
    expect(() => decryptIntegrationSecret(envelope, { ...context, credentialId: "550e8400-e29b-41d4-a716-446655440001" })).toThrow();
    expect(() => decryptIntegrationSecret(envelope, { ...context, connectorId: "other" as never })).toThrow();
  });

  it("decrypts previous key versions but always encrypts with the current version", () => {
    const previous = encryptIntegrationSecret("old", { ...context, currentKeyVersion: "v0" });
    expect(decryptIntegrationSecret(previous, context)).toBe("old");
    expect(encryptIntegrationSecret("new", context).split(".")[1]).toBe("v1");
  });

  it("rejects malformed keyrings, unknown versions, invalid tags, and wrong secret versions", () => {
    expect(() => parseSecretKeyring("not-json")).toThrow();
    expect(() => parseSecretKeyring(JSON.stringify({ v1: "short" }))).toThrow();
    const envelope = encryptIntegrationSecret("secret", context);
    expect(() => decryptIntegrationSecret(envelope.replace(".v1.", ".missing."), context)).toThrow();
    const pieces = envelope.split(".");
    pieces[4] = `${pieces[4]}x`;
    expect(() => decryptIntegrationSecret(pieces.join("."), context)).toThrow();
    expect(() => decryptIntegrationSecret(envelope, { ...context, secretVersion: 2 })).toThrow();
  });
});

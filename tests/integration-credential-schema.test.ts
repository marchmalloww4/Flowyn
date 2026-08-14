import { describe, expect, it } from "vitest";
import { integrationCredentials } from "@/lib/database/schema";

describe("integration credential schema", () => {
  it("contains ciphertext and lifecycle metadata without a plaintext secret column", () => {
    const columns = Object.keys(integrationCredentials);
    expect(columns).toEqual(expect.arrayContaining([
      "id", "workspaceId", "connectorId", "name", "encryptedSecretMaterial", "keyVersion", "secretVersion",
      "createdBy", "createdAt", "updatedAt", "revokedAt", "deletedAt", "lastUsedAt",
    ]));
    expect(columns).not.toContain("apiToken");
    expect(columns).not.toContain("secret");
  });
});

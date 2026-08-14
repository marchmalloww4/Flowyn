import { describe, expect, it } from "vitest";
import { canManageIntegrationCredentials, integrationCredentialStatus } from "@/lib/integrations/ui";

describe("integration credential panel policy", () => {
  it("keeps credential mutation OWNER/ADMIN-only", () => {
    expect(canManageIntegrationCredentials("OWNER")).toBe(true);
    expect(canManageIntegrationCredentials("ADMIN")).toBe(true);
    expect(canManageIntegrationCredentials("MEMBER")).toBe(false);
  });

  it("exposes only safe active/revoked status", () => {
    expect(integrationCredentialStatus({ revokedAt: null })).toBe("Active");
    expect(integrationCredentialStatus({ revokedAt: "2026-08-14T00:00:00Z" })).toBe("Revoked");
  });
});

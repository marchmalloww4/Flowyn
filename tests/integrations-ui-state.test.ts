import { describe, expect, it } from "vitest";
import { canManageCredentials, integrationCredentialLabel } from "@/lib/client/integrations-state";

describe("integration credential presentation state", () => {
  it("preserves existing role boundaries", () => {
    expect(canManageCredentials("OWNER")).toBe(true);
    expect(canManageCredentials("ADMIN")).toBe(true);
    expect(canManageCredentials("MEMBER")).toBe(false);
  });

  it("exposes only safe credential metadata", () => {
    expect(integrationCredentialLabel({ connectorId: "slack", name: "Primary", secretVersion: 2 })).toBe("Primary · slack · secret version 2");
  });
});

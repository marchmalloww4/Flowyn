import { describe, expect, it } from "vitest";
import { canManageMemberships, canManageWorkspace, settingsRoleLabel } from "@/lib/client/settings-state";

describe("settings presentation state", () => {
  it("keeps workspace management aligned with existing roles", () => {
    expect(canManageWorkspace("OWNER")).toBe(true);
    expect(canManageWorkspace("ADMIN")).toBe(true);
    expect(canManageWorkspace("MEMBER")).toBe(false);
    expect(canManageMemberships("OWNER")).toBe(true);
    expect(canManageMemberships("MEMBER")).toBe(false);
  });

  it("labels roles without exposing authorization internals", () => {
    expect(settingsRoleLabel("ADMIN")).toBe("Administrator");
  });
});

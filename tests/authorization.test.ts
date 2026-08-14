import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction, type WorkspaceAction, type WorkspaceRole } from "@/lib/authz/authorization";
import { canManageMembership } from "@/lib/workspaces/roles";

describe("workspace authorization policy", () => {
  const cases: Array<[WorkspaceRole, WorkspaceAction, boolean]> = [
    ["OWNER", "brand.read", true],
    ["OWNER", "brand.write", true],
    ["OWNER", "workspace.delete", true],
    ["ADMIN", "brand.read", true],
    ["ADMIN", "brand.write", true],
    ["ADMIN", "workspace.update", true],
    ["ADMIN", "workspace.delete", false],
    ["MEMBER", "brand.read", true],
    ["MEMBER", "brand.write", false],
    ["MEMBER", "membership.manage", false],
    ["OWNER", "workflow_webhook.rotate_secret", true],
    ["ADMIN", "workflow_webhook.create", true],
    ["MEMBER", "workflow_webhook.read", true],
    ["MEMBER", "workflow_webhook.create", false],
    ["MEMBER", "workflow_webhook.rotate_secret", false],
  ];

  it.each(cases)("returns %s for %s as %s", (role, action, expected) => {
    expect(canPerformWorkspaceAction(role, action)).toBe(expected);
  });

  it("keeps membership management scoped by actor and target role", () => {
    expect(canManageMembership("OWNER", "ADMIN", "remove")).toBe(true);
    expect(canManageMembership("ADMIN", null, "add")).toBe(true);
    expect(canManageMembership("ADMIN", "MEMBER", "remove")).toBe(true);
    expect(canManageMembership("ADMIN", "ADMIN", "remove")).toBe(false);
    expect(canManageMembership("ADMIN", "MEMBER", "role")).toBe(false);
    expect(canManageMembership("MEMBER", "MEMBER", "remove")).toBe(false);
  });
});

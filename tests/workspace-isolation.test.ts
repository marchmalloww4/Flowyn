import { describe, expect, it } from "vitest";
import { assertWorkspaceAccess } from "@/lib/workspaces/validation";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("workspace isolation", () => {
  const memberships = [
    { workspaceId: "workspace-a", userId: "user-a", role: "owner" },
    { workspaceId: "workspace-b", userId: "user-b", role: "owner" },
  ];

  it("allows a member to access its workspace", () => {
    expect(assertWorkspaceAccess(memberships, "user-a", "workspace-a").role).toBe("owner");
  });

  it("denies a known resource workspace to a different user", () => {
    expect(() => assertWorkspaceAccess(memberships, "user-a", "workspace-b")).toThrow("WORKSPACE_ACCESS_DENIED");
  });

  it("does not allow a member to mutate another workspace through a known id", () => {
    expect(canPerformWorkspaceAction("MEMBER", "brand.write")).toBe(false);
  });
});

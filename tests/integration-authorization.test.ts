import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction, type WorkspaceAction } from "@/lib/authz/authorization";

const actions: WorkspaceAction[] = ["integration.read", "integration.create", "integration.update", "integration.delete", "integration.rotate_secret", "integration.execute"];

describe("integration workspace authorization", () => {
  it("allows owners and admins to manage credentials and execute actions", () => {
    for (const action of actions) {
      expect(canPerformWorkspaceAction("OWNER", action)).toBe(true);
      expect(canPerformWorkspaceAction("ADMIN", action)).toBe(true);
    }
  });

  it("keeps members read-only and unable to execute external side effects", () => {
    expect(canPerformWorkspaceAction("MEMBER", "integration.read")).toBe(true);
    for (const action of actions.slice(1)) expect(canPerformWorkspaceAction("MEMBER", action)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("workspace operations authorization", () => {
  it("allows only owners and administrators to read usage and operations summaries", () => {
    for (const action of ["workspace.usage.read", "workspace.operations.read"] as const) {
      expect(canPerformWorkspaceAction("OWNER", action)).toBe(true);
      expect(canPerformWorkspaceAction("ADMIN", action)).toBe(true);
      expect(canPerformWorkspaceAction("MEMBER", action)).toBe(false);
    }
  });
});

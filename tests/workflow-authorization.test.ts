import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("workflow authorization policy", () => {
  it("allows members to read and run but not mutate definitions", () => {
    expect(canPerformWorkspaceAction("MEMBER", "workflow.read")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.run")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.write")).toBe(false);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.delete")).toBe(false);
    expect(canPerformWorkspaceAction("MEMBER", "workflow.cancel")).toBe(true);
  });

  it("allows admins and owners to manage workflow definitions", () => {
    for (const role of ["ADMIN", "OWNER"] as const) {
      expect(canPerformWorkspaceAction(role, "workflow.read")).toBe(true);
      expect(canPerformWorkspaceAction(role, "workflow.run")).toBe(true);
      expect(canPerformWorkspaceAction(role, "workflow.write")).toBe(true);
      expect(canPerformWorkspaceAction(role, "workflow.delete")).toBe(true);
      expect(canPerformWorkspaceAction(role, "workflow.cancel")).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("workflow schedule authorization", () => {
  it("allows members to read schedules only", () => {
    expect(canPerformWorkspaceAction("MEMBER", "workflow_schedule.read")).toBe(true);
    expect(canPerformWorkspaceAction("MEMBER", "workflow_schedule.create")).toBe(false);
    expect(canPerformWorkspaceAction("MEMBER", "workflow_schedule.delete")).toBe(false);
  });

  it("reserves schedule mutation for administrators and owners", () => {
    for (const action of ["workflow_schedule.create", "workflow_schedule.update", "workflow_schedule.enable", "workflow_schedule.disable", "workflow_schedule.delete"] as const) {
      expect(canPerformWorkspaceAction("ADMIN", action)).toBe(true);
      expect(canPerformWorkspaceAction("OWNER", action)).toBe(true);
      expect(canPerformWorkspaceAction("MEMBER", action)).toBe(false);
    }
  });
});

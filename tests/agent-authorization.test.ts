import { describe, expect, it } from "vitest";
import { canPerformWorkspaceAction } from "@/lib/authz/authorization";

describe("agent authorization", () => {
  it("keeps agent mutations unavailable to members", () => {
    expect(canPerformWorkspaceAction("MEMBER", "agent.write")).toBe(false);
    expect(canPerformWorkspaceAction("MEMBER", "agent.delete")).toBe(false);
  });

  it("allows administrators to manage agents", () => {
    expect(canPerformWorkspaceAction("ADMIN", "agent.read")).toBe(true);
    expect(canPerformWorkspaceAction("ADMIN", "agent.run")).toBe(true);
    expect(canPerformWorkspaceAction("ADMIN", "agent.write")).toBe(true);
    expect(canPerformWorkspaceAction("ADMIN", "agent.delete")).toBe(true);
  });
});

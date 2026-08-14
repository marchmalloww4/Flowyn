import { describe, expect, it } from "vitest";
import {
  principalUserId,
  userExecutionPrincipal,
  workspaceAutomationPrincipal,
} from "@/lib/security/principal";

describe("execution principals", () => {
  it("represents a user without changing manual identity semantics", () => {
    const principal = userExecutionPrincipal("user-1");
    expect(principal).toEqual({ kind: "user", userId: "user-1" });
    expect(principalUserId(principal)).toBe("user-1");
  });

  it("represents schedule-owned automation without a fake user", () => {
    const principal = workspaceAutomationPrincipal("workspace-1", "schedule-1");
    expect(principal).toEqual({ kind: "workspace_automation", workspaceId: "workspace-1", scheduleId: "schedule-1" });
    expect(principalUserId(principal)).toBeNull();
  });

  it("rejects incomplete internal principals", () => {
    expect(() => userExecutionPrincipal(" ")).toThrow();
    expect(() => workspaceAutomationPrincipal("workspace-1", " ")).toThrow();
  });
});

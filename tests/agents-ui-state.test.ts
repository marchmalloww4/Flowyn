import { describe, expect, it } from "vitest";
import { agentRunStatus, canManageAgents, filterWorkspaceAgents, type AgentRecord } from "@/lib/client/agents-state";

const agents: AgentRecord[] = [
  { id: "agent-a", workspaceId: "workspace-a", enabled: true, name: "Alpha" },
  { id: "agent-b", workspaceId: "workspace-b", enabled: false, name: "Beta" },
];

describe("agent presentation state", () => {
  it("keeps agent definitions workspace-scoped and surfaces only enabled usable entries for onboarding", () => {
    expect(filterWorkspaceAgents(agents, "workspace-a").map((agent) => agent.id)).toEqual(["agent-a"]);
    expect(filterWorkspaceAgents(agents, "workspace-a").some((agent) => agent.enabled)).toBe(true);
  });

  it("preserves role-aware management and safe run status text", () => {
    expect(canManageAgents("OWNER")).toBe(true);
    expect(canManageAgents("ADMIN")).toBe(true);
    expect(canManageAgents("MEMBER")).toBe(false);
    expect(agentRunStatus("RUNNING")).toBe("Running");
    expect(agentRunStatus("FAILED")).toBe("Failed");
  });
});

export type AgentRecord = { id: string; workspaceId: string; enabled: boolean; name: string };

export function filterWorkspaceAgents(agents: AgentRecord[], workspaceId: string): AgentRecord[] {
  return agents.filter((agent) => agent.workspaceId === workspaceId);
}

export function canManageAgents(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function agentRunStatus(status: string): string {
  if (status === "RUNNING") return "Running";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "MAX_STEPS_REACHED") return "Maximum steps reached";
  if (status === "FAILED") return "Failed";
  return "Queued";
}

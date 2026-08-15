export type WorkflowRecord = { id: string; workspaceId: string; enabled: boolean; name: string; currentVersion: number };

export function filterWorkspaceWorkflows(workflows: WorkflowRecord[], workspaceId: string): WorkflowRecord[] {
  return workflows.filter((workflow) => workflow.workspaceId === workspaceId);
}

export function canManageWorkflows(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function workflowStatusLabel(status: string): string {
  if (status === "WAITING_APPROVAL") return "Waiting for approval";
  if (status === "CANCEL_REQUESTED") return "Cancellation requested";
  if (status === "RUNNING") return "Running";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "FAILED") return "Failed";
  return "Queued";
}

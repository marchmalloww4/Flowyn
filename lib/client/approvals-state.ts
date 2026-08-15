export type ApprovalRecord = { id: string; workspaceId: string; status: string; workflowName: string; workflowStepName: string };

export function filterWorkspaceApprovals(approvals: ApprovalRecord[], workspaceId: string): ApprovalRecord[] {
  return approvals.filter((approval) => approval.workspaceId === workspaceId);
}

export function canDecideApprovals(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function approvalStatusLabel(status: string): string {
  if (status === "PENDING") return "Awaiting decision";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  if (status === "EXPIRED") return "Expired";
  return "Cancelled";
}

import type { WorkspaceRole } from "@/lib/workspaces/roles";

export function canManageWebhook(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function formatWebhookEventStatus(status: "TRIGGERED" | "SKIPPED" | "FAILED", reasonCode: string | null): string {
  if (status === "TRIGGERED") return "Triggered";
  if (status === "FAILED") return "Failed";
  if (reasonCode === "WORKFLOW_DISABLED") return "Skipped: workflow disabled";
  if (reasonCode === "WORKFLOW_DELETED") return "Skipped: workflow deleted";
  return "Skipped";
}

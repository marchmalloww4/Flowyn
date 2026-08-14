import { AppError } from "@/lib/security/errors";

export interface UserExecutionPrincipal {
  kind: "user";
  userId: string;
}

export interface WorkspaceAutomationPrincipal {
  kind: "workspace_automation";
  workspaceId: string;
  scheduleId: string;
}

export type ExecutionPrincipal = UserExecutionPrincipal | WorkspaceAutomationPrincipal;

export function userExecutionPrincipal(userId: string): UserExecutionPrincipal {
  if (!userId.trim()) throw new AppError("EXECUTION_PRINCIPAL_INVALID", 500, "A user execution principal requires a user ID.");
  return { kind: "user", userId };
}

export function workspaceAutomationPrincipal(workspaceId: string, scheduleId: string): WorkspaceAutomationPrincipal {
  if (!workspaceId.trim() || !scheduleId.trim()) {
    throw new AppError("EXECUTION_PRINCIPAL_INVALID", 500, "An automation principal requires workspace and schedule scope.");
  }
  return { kind: "workspace_automation", workspaceId, scheduleId };
}

export function principalUserId(principal: ExecutionPrincipal): string | null {
  return principal.kind === "user" ? principal.userId : null;
}

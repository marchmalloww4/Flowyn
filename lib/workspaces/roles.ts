export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export type MembershipAction = "add" | "role" | "remove";

export function canManageMembership(actorRole: WorkspaceRole, targetRole: WorkspaceRole | null, action: MembershipAction): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole !== "ADMIN") return false;
  if (action === "add") return targetRole === null;
  return action === "remove" && targetRole === "MEMBER";
}

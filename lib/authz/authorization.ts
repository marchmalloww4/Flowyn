import { and, eq } from "drizzle-orm";
import { getDatabase, type Database, workspaceMembers } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/workspaces/roles";

export type { WorkspaceRole } from "@/lib/workspaces/roles";

export type WorkspaceAction =
  | "workspace.read"
  | "workspace.update"
  | "workspace.delete"
  | "membership.manage"
  | "membership.role"
  | "brand.read"
  | "brand.write"
  | "brand.delete"
  | "agent.read"
  | "agent.run"
  | "agent.write"
  | "agent.delete"
  | "workflow.read"
  | "workflow.run"
  | "workflow.write"
  | "workflow.delete"
  | "workflow.cancel"
  | "workflow_approval.read"
  | "workflow_approval.decide"
  | "workflow_schedule.read"
  | "workflow_schedule.create"
  | "workflow_schedule.update"
  | "workflow_schedule.enable"
  | "workflow_schedule.disable"
  | "workflow_schedule.delete"
  | "workflow_webhook.read"
  | "workflow_webhook.create"
  | "workflow_webhook.update"
  | "workflow_webhook.enable"
  | "workflow_webhook.disable"
  | "workflow_webhook.delete"
  | "workflow_webhook.rotate_secret"
  | "integration.read"
  | "integration.create"
  | "integration.update"
  | "integration.delete"
  | "integration.rotate_secret"
  | "integration.execute";

export function canPerformWorkspaceAction(role: WorkspaceRole, action: WorkspaceAction): boolean {
  if (role === "OWNER") return true;
  if (role === "ADMIN") return ["workspace.read", "workspace.update", "membership.manage", "brand.read", "brand.write", "brand.delete", "agent.read", "agent.run", "agent.write", "agent.delete", "workflow.read", "workflow.run", "workflow.write", "workflow.delete", "workflow.cancel", "workflow_approval.read", "workflow_approval.decide", "workflow_schedule.read", "workflow_schedule.create", "workflow_schedule.update", "workflow_schedule.enable", "workflow_schedule.disable", "workflow_schedule.delete", "workflow_webhook.read", "workflow_webhook.create", "workflow_webhook.update", "workflow_webhook.enable", "workflow_webhook.disable", "workflow_webhook.delete", "workflow_webhook.rotate_secret", "integration.read", "integration.create", "integration.update", "integration.delete", "integration.rotate_secret", "integration.execute"].includes(action);
  return ["workspace.read", "brand.read", "agent.read", "agent.run", "workflow.read", "workflow.run", "workflow.cancel", "workflow_approval.read", "workflow_schedule.read", "workflow_webhook.read", "integration.read"].includes(action);
}

function normalizeRole(role: string): WorkspaceRole {
  const normalized = role.toUpperCase();
  if (!isWorkspaceRole(normalized)) throw new AppError("INVALID_WORKSPACE_ROLE", 500, "Workspace membership has an invalid role.");
  return normalized;
}

export async function requireWorkspaceMember(userId: string, workspaceId: string, db: Database = getDatabase()) {
  const [membership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (!membership) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
  return { ...membership, role: normalizeRole(membership.role) };
}

export async function requireWorkspaceRole(userId: string, workspaceId: string, roles: WorkspaceRole[], db: Database = getDatabase()) {
  const membership = await requireWorkspaceMember(userId, workspaceId, db);
  if (!roles.includes(membership.role)) throw new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission for this workspace action.");
  return membership;
}

export async function requireWorkspaceAction(userId: string, workspaceId: string, action: WorkspaceAction, db: Database = getDatabase()) {
  const membership = await requireWorkspaceMember(userId, workspaceId, db);
  if (!canPerformWorkspaceAction(membership.role, action)) throw new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission for this workspace action.");
  return membership;
}

export async function requireWorkspaceResource<T extends { workspaceId: string }>(userId: string, resourceId: string, load: (resourceId: string) => Promise<T | undefined>, db: Database = getDatabase()): Promise<T> {
  const resource = await load(resourceId);
  if (!resource) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  await requireWorkspaceMember(userId, resource.workspaceId, db);
  return resource;
}

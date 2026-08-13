import { desc, eq } from "drizzle-orm";
import { getDatabase, type Database, user, workspaceMembers, workspaces } from "@/lib/database";
import { requireWorkspaceMember as requireAuthorizedWorkspaceMember } from "@/lib/authz/authorization";
import { requireWorkspaceAction, requireWorkspaceRole } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { AppError } from "@/lib/security/errors";
import { type WorkspaceInput, type WorkspacePatch } from "@/lib/workspaces/validation";

function slugForName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export const requireWorkspaceMember = requireAuthorizedWorkspaceMember;

export async function listWorkspaces(userId: string, db: Database = getDatabase()) {
  return db.select({ workspace: workspaces, role: workspaceMembers.role }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(eq(workspaceMembers.userId, userId)).orderBy(desc(workspaces.createdAt));
}

export async function createWorkspace(userId: string, input: WorkspaceInput, db: Database = getDatabase()) {
  const slug = input.slug || slugForName(input.name);
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name: input.name, slug, createdBy: userId }).returning();
    if (!workspace) throw new AppError("WORKSPACE_CREATE_FAILED", 500, "Workspace could not be created.");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "OWNER" });
    await recordAuditEvent({ workspaceId: workspace.id, actorUserId: userId, action: "workspace.created", resourceType: "workspace", resourceId: workspace.id }, tx);
    return workspace;
  });
}

export async function getWorkspace(userId: string, workspaceId: string, db: Database = getDatabase()) {
  await requireWorkspaceMember(userId, workspaceId, db);
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
  return workspace;
}

export async function updateWorkspace(userId: string, workspaceId: string, input: WorkspacePatch, db: Database = getDatabase()) {
  await requireWorkspaceAction(userId, workspaceId, "workspace.update", db);
  const [workspace] = await db.update(workspaces).set({ ...input, updatedAt: new Date() }).where(eq(workspaces.id, workspaceId)).returning();
  if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
  await recordAuditEvent({ workspaceId, actorUserId: userId, action: "workspace.updated", resourceType: "workspace", resourceId: workspaceId, metadata: { fields: Object.keys(input) } }, db);
  return workspace;
}

export async function deleteWorkspace(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, ["OWNER"], db);
  await db.transaction(async (tx) => {
    const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    await recordAuditEvent({ workspaceId, actorUserId: userId, action: "workspace.deleted", resourceType: "workspace", resourceId: workspaceId }, tx);
    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });
}

export async function ensureUserExists(userId: string, db: Database = getDatabase()) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!existing) throw new AppError("USER_NOT_FOUND", 401, "Authenticated user no longer exists.");
}
